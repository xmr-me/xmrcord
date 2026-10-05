/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 s0i4x and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import { Channel } from "@vencord/discord-types";
import { ChannelStore, Constants, RelationshipStore, RestAPI, showToast, Toasts, UserStore } from "@webpack/common";

const logger = new Logger("MessageCleaner");

export type Phase = "idle" | "scanning" | "review" | "deleting" | "done" | "cancelled" | "error";

export interface ChatRef {
    label: string;
    guildId?: string | null;
    /** Missing for a friend whose DM is not in the client's list; looked up from `userId` during the scan. */
    channelId?: string;
    userId?: string;
}

/** What a job runs on: one chat, or many (e.g. the DMs of every friend). */
export interface CleanTarget {
    label: string;
    chats: ChatRef[];
}

export interface CleanOptions {
    /** Only the N most recent matching messages of each chat; 0 = all. */
    limit: number;
    /** Case-insensitive substring the message must contain; empty = any. */
    contains: string;
    includePinned: boolean;
    /** Pause between two deletions, in ms. */
    deleteDelay: number;
}

interface FoundMessage {
    id: string;
    channelId: string;
    timestamp: string;
}

export interface JobState {
    phase: Phase;
    label: string;
    options: CleanOptions;
    chatCount: number;
    /** While scanning: how many chats are done and which one is being read. */
    chatIndex: number;
    currentChat: string;
    /** Messages read by the scan so far. */
    read: number;
    found: number;
    /** Grouped by chat, newest first inside each chat. */
    queue: FoundMessage[];
    /** Chats that have something to delete. */
    breakdown: Array<{ label: string; count: number; }>;
    /** Chats of a batch that Discord refused to let us read. */
    unreachable: number;
    deleted: number;
    failed: number;
    /** > 0 while paused by a Discord rate limit, in ms. */
    rateLimitWait: number;
    error: string;
}

const IDLE: JobState = {
    phase: "idle",
    label: "",
    options: { limit: 0, contains: "", includePinned: false, deleteDelay: 1500 },
    chatCount: 0,
    chatIndex: 0,
    currentChat: "",
    read: 0,
    found: 0,
    queue: [],
    breakdown: [],
    unreachable: 0,
    deleted: 0,
    failed: 0,
    rateLimitWait: 0,
    error: ""
};

const HISTORY_PAGE_SIZE = 100;
const HISTORY_DELAY = 400;
const SEARCH_DELAY = 1500;
const MAX_ATTEMPTS = 6;
const MAX_DELETE_DELAY = 6000;

// Default, pin notice, reply, slash command and context menu command. Every other type is a
// system message its author cannot delete.
const DELETABLE_TYPES = new Set([0, 6, 19, 20, 23]);

class CancelToken {
    cancelled = false;
    private wake: (() => void) | null = null;

    cancel() {
        this.cancelled = true;
        this.wake?.();
    }

    /** Resolves early when cancelled. */
    sleep(ms: number) {
        if (this.cancelled) return Promise.resolve();
        return new Promise<void>(resolve => {
            const finish = () => {
                clearTimeout(timer);
                this.wake = null;
                resolve();
            };
            const timer = setTimeout(finish, ms);
            this.wake = finish;
        });
    }
}

let state: JobState = IDLE;
let activeToken: CancelToken | null = null;
const listeners = new Set<() => void>();

export const getJob = () => state;

export function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

function setState(next: JobState) {
    state = next;
    listeners.forEach(l => l());
}

function update(patch: Partial<JobState>) {
    setState({ ...state, ...patch });
}

export function isBusy() {
    return state.phase === "scanning" || state.phase === "deleting";
}

export function getChannelLabel(channel: Channel) {
    if (channel.isDM()) {
        const user = UserStore.getUser(channel.recipients[0]);
        return user ? `@${user.username}` : "DM";
    }
    if (channel.isGroupDM()) return channel.name || "Grupo";
    return `#${channel.name}`;
}

export function getChannelTarget(channel: Channel): CleanTarget {
    const label = getChannelLabel(channel);
    return { label, chats: [{ label, channelId: channel.id, guildId: channel.guild_id }] };
}

/** Every friend, including the ones whose DM is closed (those have no channelId yet). */
export function getFriendsTarget(): CleanTarget {
    const chats = RelationshipStore.getFriendIDs().map(userId => {
        const user = UserStore.getUser(userId);
        return {
            label: user ? `@${user.username}` : userId,
            userId,
            channelId: ChannelStore.getDMFromUserId(userId)
        };
    });

    return { label: `todos os amigos (${chats.length})`, chats };
}

const isOlder = (a: string, b: string) => a.length !== b.length ? a.length < b.length : a < b;

function retryAfterMs(body: any) {
    // retry_after is in seconds
    const seconds = Number(body?.retry_after);
    return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds * 1000) + 250 : 2000;
}

function describeError(err: any) {
    const message = err?.body?.message ?? err?.message ?? String(err);
    return err?.status ? `${message} (HTTP ${err.status})` : message;
}

/**
 * Runs a request, waiting out rate limits (429), search indexing (202) and transient failures.
 * Returns null if the job was cancelled, throws once it is out of attempts or on a permanent error.
 */
async function request(token: CancelToken, run: () => Promise<any>, onRateLimit?: () => void) {
    for (let attempt = 1; ; attempt++) {
        if (token.cancelled) return null;

        let wait: number;
        try {
            const res = await run();
            if (res?.status !== 202) return res;
            if (attempt >= MAX_ATTEMPTS) throw new Error("O Discord ainda está indexando este canal para busca.");
            wait = retryAfterMs(res.body);
        } catch (err: any) {
            const status = err?.status;
            const transient = status === 429 || status == null || status >= 500;
            if (!transient || attempt >= MAX_ATTEMPTS) throw err;

            if (status === 429) onRateLimit?.();
            wait = status === 429 ? retryAfterMs(err.body) : 3000;
        }

        update({ rateLimitWait: wait });
        await token.sleep(wait);
        update({ rateLimitWait: 0 });
    }
}

/**
 * Looks up the existing DM with a friend without opening it in the client.
 * Returns null when there is no DM, or it never had a message.
 */
async function findFriendDM(userId: string, token: CancelToken): Promise<string | null> {
    try {
        const res = await request(token, () => RestAPI.get({ url: `/users/@me/dms/${userId}` }));
        return res?.body?.last_message_id ? res.body.id : null;
    } catch (err: any) {
        if (err?.status === 404) return null;
        throw err;
    }
}

async function scanChannel(
    channelId: string,
    guildId: string | null | undefined,
    options: CleanOptions,
    token: CancelToken,
    onProgress: (read: number, found: number) => void
) {
    const me = UserStore.getCurrentUser().id;
    const needle = options.contains.trim().toLowerCase();
    const seen = new Set<string>();
    const queue: FoundMessage[] = [];

    // Guild channels can hold millions of messages from other people, so ask the search index for
    // ours only. DMs are read page by page, which is exact and returns 100 messages per request.
    let useSearch = guildId != null;
    let before: string | undefined;

    while (!token.cancelled) {
        let page: any[];
        try {
            const res = await request(token, () => useSearch
                ? RestAPI.get({
                    url: `/guilds/${guildId}/messages/search`,
                    query: {
                        author_id: me,
                        channel_id: channelId,
                        include_nsfw: true,
                        sort_by: "timestamp",
                        sort_order: "desc",
                        ...(before ? { max_id: before } : {})
                    }
                })
                : RestAPI.get({
                    url: Constants.Endpoints.MESSAGES(channelId),
                    query: { limit: HISTORY_PAGE_SIZE, ...(before ? { before } : {}) }
                })
            );
            if (!res) break;
            page = useSearch ? (res.body?.messages ?? []).flat() : res.body ?? [];
        } catch (err) {
            // Search unavailable from the start: read the history instead.
            if (!useSearch || before) throw err;
            logger.warn("Search failed, falling back to reading the channel history", err);
            useSearch = false;
            continue;
        }

        // max_id may include the cursor itself, so the scan ends when a page brings nothing new.
        const fresh = page.filter(m => !seen.has(m.id));
        if (fresh.length === 0) break;

        let limitReached = false;
        for (const m of fresh) {
            seen.add(m.id);
            if (!before || isOlder(m.id, before)) before = m.id;

            if (limitReached) continue;
            if (m.author?.id !== me || !DELETABLE_TYPES.has(m.type)) continue;
            if (m.pinned && !options.includePinned) continue;
            if (needle && !String(m.content ?? "").toLowerCase().includes(needle)) continue;

            queue.push({ id: m.id, channelId: m.channel_id, timestamp: m.timestamp });
            limitReached = options.limit > 0 && queue.length >= options.limit;
        }

        onProgress(seen.size, queue.length);

        if (limitReached || (!useSearch && page.length < HISTORY_PAGE_SIZE)) break;
        await token.sleep(useSearch ? SEARCH_DELAY : HISTORY_DELAY);
    }

    return queue;
}

async function scanAll(chats: ChatRef[], options: CleanOptions, token: CancelToken) {
    const queue: FoundMessage[] = [];
    const breakdown: JobState["breakdown"] = [];
    let readBefore = 0;
    let unreachable = 0;

    for (let i = 0; i < chats.length && !token.cancelled; i++) {
        const chat = chats[i];
        update({ chatIndex: i, currentChat: chat.label });

        let read = 0;
        let found: FoundMessage[] = [];
        try {
            const channelId = chat.channelId ?? await findFriendDM(chat.userId!, token);
            if (channelId) {
                found = await scanChannel(channelId, chat.guildId, options, token, (r, f) => {
                    read = r;
                    update({ read: readBefore + r, found: queue.length + f });
                });
            }
        } catch (err: any) {
            // In a batch, one chat Discord refuses to show must not stop the others.
            const status = err?.status;
            const refused = status >= 400 && status < 500 && status !== 429;
            if (chats.length === 1 || !refused) throw err;

            unreachable++;
            update({ unreachable });
            logger.warn(`Could not read ${chat.label}`, err);
        }

        readBefore += read;
        for (const msg of found) queue.push(msg);
        if (found.length > 0) breakdown.push({ label: chat.label, count: found.length });

        if (i < chats.length - 1) await token.sleep(HISTORY_DELAY);
    }

    breakdown.sort((a, b) => b.count - a.count);
    return { queue, breakdown };
}

async function deleteQueue(token: CancelToken) {
    const { queue, options } = state;
    let delay = options.deleteDelay;
    let deleted = 0;
    let failed = 0;

    for (let i = 0; i < queue.length && !token.cancelled; i++) {
        const msg = queue[i];
        try {
            const res = await request(
                token,
                () => RestAPI.del({ url: Constants.Endpoints.MESSAGE(msg.channelId, msg.id) }),
                // Each rate limit hit slows the rest of the run down.
                () => { delay = Math.min(delay + 500, MAX_DELETE_DELAY); }
            );
            if (!res) break;
            deleted++;
        } catch (err: any) {
            // 404 = already gone
            if (err?.status === 404) {
                deleted++;
            } else {
                failed++;
                logger.warn(`Failed to delete message ${msg.id}`, err);
            }
        }

        update({ deleted, failed });
        if (i < queue.length - 1) await token.sleep(delay);
    }
}

function fail(err: unknown) {
    logger.error("Job failed", err);
    update({ phase: "error", error: describeError(err), rateLimitWait: 0 });
}

/** Phase 1: reads every chat of the target and builds the list of messages to delete. Deletes nothing. */
export function startScan(target: CleanTarget, options: CleanOptions) {
    if (isBusy() || target.chats.length === 0) return;

    const token = activeToken = new CancelToken();
    setState({ ...IDLE, phase: "scanning", label: target.label, chatCount: target.chats.length, options });

    scanAll(target.chats, options, token).then(
        ({ queue, breakdown }) => update(token.cancelled
            ? { phase: "cancelled", rateLimitWait: 0 }
            : { phase: "review", queue, breakdown, found: queue.length }),
        fail
    );
}

/** Phase 2: deletes what the scan found. Only callable from the review step. */
export function startDelete() {
    if (state.phase !== "review" || state.queue.length === 0) return;

    const token = activeToken = new CancelToken();
    update({ phase: "deleting" });

    deleteQueue(token).then(() => {
        update({ phase: token.cancelled ? "cancelled" : "done", rateLimitWait: 0 });
        showToast(
            `CL ${token.cancelled ? "cancelado" : "concluído"}: ${state.deleted} mensagens apagadas em ${state.label}`,
            token.cancelled ? Toasts.Type.MESSAGE : Toasts.Type.SUCCESS
        );
    }, fail);
}

export function cancelJob() {
    activeToken?.cancel();
    if (state.phase === "review") setState(IDLE);
}

export function resetJob() {
    if (!isBusy()) setState(IDLE);
}
