/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 s0i4x and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
// Reuse the exact store instance Vencord's MemberCount plugin reads from for its tooltip online count.
import { OnlineMemberCountStore } from "@plugins/memberCount/OnlineMemberCountStore";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { Guild } from "@vencord/discord-types";
import { findStore } from "@webpack";
import { Menu } from "@webpack/common";

import { openServerFakerModal } from "./ConfigModal";
import { affectsGuildRecord, GuildFakeConfig, parseCount } from "./types";

const logger = new Logger("ServerFaker");

const settings = definePluginSettings({
    guilds: {
        type: OptionType.CUSTOM,
        default: {} as Record<string, GuildFakeConfig>,
        // Fires when the whole map is reassigned (which is what the modal does on every edit).
        onChange: () => refresh()
    }
});

// ---------- config access ----------

export function getGuildConfig(id: string): GuildFakeConfig | undefined {
    return settings.store.guilds?.[id];
}

export function setGuildConfig(id: string, cfg: GuildFakeConfig | null) {
    const guilds = { ...(settings.store.guilds ?? {}) };
    if (cfg == null) delete guilds[id];
    else guilds[id] = cfg;
    // Reassigning the whole object persists it and triggers onChange -> refresh().
    settings.store.guilds = guilds;
}

// ---------- runtime store overrides ----------

type AnyStore = Record<string, any>;

let GuildStore: AnyStore | undefined;
let GuildMemberCountStore: AnyStore | undefined;
let ChannelMemberStore: AnyStore | undefined;
const restores: Array<() => void> = [];

// Faked guild records are cached by their original record so the same object is returned between
// renders (referential stability). The cache is dropped whenever config changes or the guild record
// is rebuilt by Discord (a new original -> a new clone).
let fakeGuildCache = new WeakMap<object, object>();

function buildFakeGuild(guild: AnyStore, cfg: GuildFakeConfig): object {
    const patch: AnyStore = {};

    if (cfg.verified || cfg.partnered) {
        const features = new Set<string>(guild.features ?? []);
        if (cfg.verified) features.add("VERIFIED");
        if (cfg.partnered) features.add("PARTNERED");
        patch.features = features;
    }

    if (cfg.boost) {
        patch.premiumTier = Math.max(0, Math.min(3, cfg.boostTier | 0));
        const count = parseCount(cfg.boostCount);
        if (count != null) patch.premiumSubscriberCount = count;
    }

    // Guild records are plain objects tagged with a type Symbol; a spread keeps the tag.
    return { ...guild, ...patch };
}

/** The fake online count for a guild, or null to leave it alone. Mirrors the getOnlineCount logic. */
function computeFakeOnline(guildId: string, cfg: GuildFakeConfig): number | null {
    if (cfg.onlinePercent > 0) {
        const total = GuildMemberCountStore?.getMemberCount(guildId);
        if (typeof total === "number" && Number.isFinite(total)) {
            return Math.round((total * cfg.onlinePercent) / 100);
        }
    }
    return parseCount(cfg.onlineCount);
}

/**
 * Return a cloned `groups` array (non-offline counts scaled so their sum === fakeOnline), leaving the
 * original group objects and the `rows` untouched. The member list renders from `rows`, while
 * Vencord's MemberCount plugin sums `groups[].count`, so this fixes the online number the user sees
 * without changing how many rows the sidebar renders.
 */
function fakeGroups(groups: any[], fakeOnline: number): any[] {
    if (!Array.isArray(groups) || groups.length === 0) {
        return [{ id: "online", count: fakeOnline }];
    }

    const targets = groups.filter(g => g.id !== "offline");
    if (targets.length === 0) {
        return [...groups, { id: "online", count: fakeOnline }];
    }

    const realSum = targets.reduce((t, g) => t + (g.count || 0), 0);
    if (realSum === fakeOnline) return groups;

    const out = groups.map(g => ({ ...g }));
    const outTargets = out.filter(g => g.id !== "offline");

    if (realSum <= 0) {
        outTargets.forEach((g, i) => { g.count = i === 0 ? fakeOnline : 0; });
    } else {
        let assigned = 0;
        outTargets.forEach((g, i) => {
            if (i === outTargets.length - 1) {
                g.count = Math.max(0, fakeOnline - assigned);
            } else {
                g.count = Math.round(((g.count || 0) * fakeOnline) / realSum);
                assigned += g.count;
            }
        });
    }
    return out;
}

function override(obj: AnyStore, key: string, make: (orig: (...args: any[]) => any) => (...args: any[]) => any) {
    const hadOwn = Object.prototype.hasOwnProperty.call(obj, key);
    const original = obj[key];
    const bound = typeof original === "function" ? original.bind(obj) : original;
    obj[key] = make(bound);
    restores.push(() => {
        if (hadOwn) obj[key] = original;
        else delete obj[key];
    });
}

function installOverrides() {
    GuildStore = findStore("GuildStore");
    GuildMemberCountStore = findStore("GuildMemberCountStore");
    ChannelMemberStore = findStore("ChannelMemberStore");

    if (!GuildStore || !GuildMemberCountStore) {
        logger.error("Could not find the required stores; overrides not installed.");
        return;
    }

    // Badges + boost: fake the guild record returned for configured guilds.
    override(GuildStore, "getGuild", orig => (id: string) => {
        const guild = orig(id);
        if (!guild) return guild;

        const cfg = getGuildConfig(id);
        if (!cfg || !affectsGuildRecord(cfg)) return guild;

        let faked = fakeGuildCache.get(guild);
        if (!faked) {
            faked = buildFakeGuild(guild, cfg);
            fakeGuildCache.set(guild, faked);
        }
        return faked;
    });

    // Member / online counts.
    override(GuildMemberCountStore, "getMemberCount", orig => (id: string) => {
        const cfg = getGuildConfig(id);
        const n = cfg ? parseCount(cfg.memberCount) : null;
        return n != null ? n : orig(id);
    });
    override(GuildMemberCountStore, "getOnlineCount", orig => (id: string) => {
        const cfg = getGuildConfig(id);
        const n = cfg ? computeFakeOnline(id, cfg) : null;
        return n != null ? n : orig(id);
    });

    // Vencord's MemberCount plugin derives the online number from the member list groups, which
    // override every other source in the main widget. Fake those group counts too.
    if (ChannelMemberStore) {
        override(ChannelMemberStore, "getProps", orig => (guildId: string, channelId: string) => {
            const props = orig(guildId, channelId);
            const cfg = guildId ? getGuildConfig(guildId) : undefined;
            if (!cfg || !props) return props;

            const fakeOnline = computeFakeOnline(guildId, cfg);
            if (fakeOnline == null) return props;

            return { ...props, groups: fakeGroups(props.groups, fakeOnline) };
        });
    }

    // In MemberCount's server-list TOOLTIP (isTooltip), the online number comes from its own
    // OnlineMemberCountStore.getCount instead of the member list. Fake that too.
    try {
        override(OnlineMemberCountStore as AnyStore, "getCount", orig => (guildId?: string) => {
            const cfg = guildId ? getGuildConfig(guildId) : undefined;
            const n = cfg ? computeFakeOnline(guildId!, cfg) : null;
            return n != null ? n : orig(guildId);
        });
    } catch (e) {
        logger.error("Could not override OnlineMemberCountStore (MemberCount tooltip count)", e);
    }

    refresh();
}

function uninstallOverrides() {
    while (restores.length) {
        try {
            restores.pop()!();
        } catch (e) {
            logger.error("Failed to restore an override", e);
        }
    }
    fakeGuildCache = new WeakMap();
    emitChanges();
}

function emitChanges() {
    try {
        GuildStore?.emitChange();
    } catch { /* emitChange outside a dispatch is best-effort */ }
    try {
        GuildMemberCountStore?.emitChange();
    } catch { /* ignore */ }
    try {
        ChannelMemberStore?.emitChange();
    } catch { /* ignore */ }
    try {
        (OnlineMemberCountStore as AnyStore)?.emitChange?.();
    } catch { /* ignore */ }
}

/** Drop cached fakes and ask every subscriber to re-read. Called after any config change. */
export function refresh() {
    fakeGuildCache = new WeakMap();
    emitChanges();
}

// ---------- context menu entry ----------

const patchGuildContext: NavContextMenuPatchCallback = (children, { guild }: { guild?: Guild; }) => {
    if (!guild) return;

    const group = findGroupChildrenByChildId("privacy", children) ?? children;
    group.push(
        <Menu.MenuItem
            id="vc-server-faker"
            label="Fake Server (ServerFaker)"
            action={() => openServerFakerModal(guild)}
        />
    );
};

export default definePlugin({
    name: "ServerFaker",
    description:
        "Localmente (só no seu cliente) finge contagem de membros/online, selo de verificado/parceiro e boost de um servidor. Nada é enviado ao Discord.",
    authors: [{ name: "s0i4x", id: 0n }],
    tags: ["Servers", "Fun"],
    settings,

    contextMenus: {
        "guild-context": patchGuildContext,
        "guild-header-popout": patchGuildContext
    },

    start() {
        installOverrides();
    },

    stop() {
        uninstallOverrides();
    }
});
