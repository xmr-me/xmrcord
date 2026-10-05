/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 s0i4x and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Divider } from "@components/Divider";
import { fetchUserProfile } from "@utils/discord";
import { findByPropsLazy, findCssClassesLazy } from "@webpack";
import { ChannelStore, Checkbox, Dialog, Forms, GuildStore, IconUtils, React, ScrollerThin, SearchableSelect, Text, Tooltip, useEffect, useMemo, useRef, useState, useStateFromStores, UserStore, VoiceStateStore } from "@webpack/common";

const PopoutClasses = findCssClassesLazy("container", "popoutRoleDot");
const { selectVoiceChannel } = findByPropsLazy("selectVoiceChannel", "selectChannel");

const BADGE_CDN = "https://cdn.discordapp.com/badge-icons/";

const BADGES = [
    { flag: 512,    hash: "7060786766c9c840eb3019e725d2b358", label: "Early Supporter" },
    { flag: 131072, hash: "6df5892e0f35b051f8b61eace34f4967", label: "Early Verified Bot Dev" },
    { flag: 4,      hash: "bf01d1073931f921909045f3a39fd264", label: "HypeSquad Events" },
    { flag: 262144, hash: "fee1624003e2fee35cb398e125dc479b", label: "Moderator Alumni" },
    { flag: 2,      hash: "3f9748e53446a137a052f3454e2de41e", label: "Parceiro (Partner)" },
    { flag: 8,      hash: "2717692c7dca7289b35297368a940dd0", label: "Bug Hunter" },
    { flag: 16384,  hash: "848f79194d4be5ff5f81505cbd0ce1e6", label: "Bug Hunter Nível 2" },
] as const;

type BadgeFlag = typeof BADGES[number]["flag"];

// Delay between API fetches; only fires when the user isn't already cached.
const FETCH_DELAY_MS = 400;

function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)); }

// Returns publicFlags from cache when available, falls back to a profile fetch.
// The 400 ms delay is only called between actual API hits, keeping us well under
// Discord's rate limits (~2–3 req/s is safe for the profile endpoint).
async function resolvePublicFlags(userId: string): Promise<number> {
    const cached = UserStore.getUser(userId)?.publicFlags;
    if (cached != null) return cached;
    try {
        await fetchUserProfile(userId);
        return UserStore.getUser(userId)?.publicFlags ?? 0;
    } catch {
        return 0;
    }
}

// Verified-server checkmark (blue shield + check, matches Discord's visual)
function VerifiedIcon({ size = 16 }: { size?: number; }) {
    return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
            <path fill="#5865F2" d="M15.4 7.6c0 .79-1.28 1.38-1.52 2.09s.44 2 0 2.59-1.84.35-2.46.8-.79 1.84-1.54 2.09-1.67-.8-2.47-.8-1.75 1-2.47.8-.92-1.64-1.54-2.09-2-.18-2.46-.8.23-1.84 0-2.59-1.54-1.3-1.54-2.09 1.28-1.38 1.52-2.09-.44-2 0-2.59 1.85-.35 2.48-.8.78-1.84 1.53-2.09 1.67.8 2.47.8 1.75-1 2.47-.8.91 1.64 1.53 2.09 2 .18 2.46.8-.23 1.84 0 2.59 1.54 1.3 1.54 2.09z"/>
            <path fill="#fff" d="M6.8 10.5 3.9 7.9l.9-1 1.8 1.6 4-4.5 1 .9z"/>
        </svg>
    );
}

// Partner purple badge
function PartnerIcon({ size = 16 }: { size?: number; }) {
    return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
            <path fill="#5865F2" d="M15.4 7.6c0 .79-1.28 1.38-1.52 2.09s.44 2 0 2.59-1.84.35-2.46.8-.79 1.84-1.54 2.09-1.67-.8-2.47-.8-1.75 1-2.47.8-.92-1.64-1.54-2.09-2-.18-2.46-.8.23-1.84 0-2.59-1.54-1.3-1.54-2.09 1.28-1.38 1.52-2.09-.44-2 0-2.59 1.85-.35 2.48-.8.78-1.84 1.53-2.09 1.67.8 2.47.8 1.75-1 2.47-.8.91 1.64 1.53 2.09 2 .18 2.46.8-.23 1.84 0 2.59 1.54 1.3 1.54 2.09z"/>
            <path fill="#fff" d="M8 4.2a1 1 0 0 1 1 1v1.2H10a1 1 0 0 1 0 2H9v1.2a1 1 0 0 1-2 0V8.4H5.9a1 1 0 0 1 0-2H7V5.2a1 1 0 0 1 1-1z"/>
        </svg>
    );
}

// Speaker icon for voice channel labels
function SpeakerIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3a1 1 0 0 0-1-1h-.06a1 1 0 0 0-.74.32L5.92 7H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2.92l4.28 4.68a1 1 0 0 0 .74.32H11a1 1 0 0 0 1-1V3Z"/>
            <path d="M15.1 20.75c-.58.14-1.1-.33-1.1-.92v-.03c0-.5.37-.92.85-1.05a7 7 0 0 0 0-13.5A1.11 1.11 0 0 1 14 4.2v-.03c0-.6.52-1.06 1.1-.92a9 9 0 0 1 0 17.5Z"/>
        </svg>
    );
}

export function BadgeVoicePanel() {
    const guilds = useStateFromStores([GuildStore], () =>
        Object.values(GuildStore.getGuilds()).sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
    );

    // Voice counts per guild, kept live via VoiceStateStore subscription
    const voiceCountsPerGuild = useStateFromStores([VoiceStateStore], () => {
        const map = new Map<string, number>();
        for (const guild of guilds) {
            const states = VoiceStateStore.getVoiceStates(guild.id);
            if (states) map.set(guild.id, Object.keys(states).length);
        }
        return map;
    }, [guilds]);

    // Options for SearchableSelect — sorted: servers with people in call first
    const guildOptions = useMemo(() =>
        [...guilds]
            .sort((a, b) => (voiceCountsPerGuild.get(b.id) ?? 0) - (voiceCountsPerGuild.get(a.id) ?? 0))
            .map(g => ({ label: g.name, value: g.id })),
        [guilds, voiceCountsPerGuild]
    );

    const [selectedGuildId, setSelectedGuildId] = useState<string | undefined>(undefined);
    const [selectedBadges, setSelectedBadges] = useState<Set<BadgeFlag>>(new Set());
    const [flagsMap, setFlagsMap] = useState<Map<string, number>>(new Map());
    const [fetchedCount, setFetchedCount] = useState(0);
    const [totalToFetch, setTotalToFetch] = useState(0);
    const fetchAbort = useRef<{ stopped: boolean }>({ stopped: false });

    // Flat list of users currently in voice in the selected guild
    const voiceUsers = useStateFromStores([VoiceStateStore], (): Array<{ userId: string; channelId: string; }> => {
        if (!selectedGuildId) return [];
        const states = VoiceStateStore.getVoiceStates(selectedGuildId) as
            Record<string, { channelId: string; }> | undefined;
        if (!states) return [];
        return Object.entries(states).map(([userId, vs]) => ({ userId, channelId: vs.channelId }));
    }, [selectedGuildId]);

    const voiceKey = voiceUsers.map(u => u.userId).sort().join(",");

    useEffect(() => {
        if (!selectedGuildId) {
            setFlagsMap(new Map());
            setFetchedCount(0);
            setTotalToFetch(0);
            return;
        }

        const ctrl = { stopped: false };
        fetchAbort.current.stopped = true;
        fetchAbort.current = ctrl;
        setFlagsMap(new Map());
        setFetchedCount(0);
        setTotalToFetch(voiceUsers.length);
        if (voiceUsers.length === 0) return;

        (async () => {
            const map = new Map<string, number>();
            let count = 0;
            for (const { userId } of voiceUsers) {
                if (ctrl.stopped) break;

                // Only delay when we actually need a network call
                const needsFetch = UserStore.getUser(userId)?.publicFlags == null;
                map.set(userId, await resolvePublicFlags(userId));
                count++;

                if (!ctrl.stopped) { setFlagsMap(new Map(map)); setFetchedCount(count); }
                if (needsFetch) await sleep(FETCH_DELAY_MS);
            }
        })();

        return () => { ctrl.stopped = true; };
    }, [selectedGuildId, voiceKey]);

    const toggleBadge = (flag: BadgeFlag) =>
        setSelectedBadges(prev => {
            const next = new Set(prev);
            next.has(flag) ? next.delete(flag) : next.add(flag);
            return next;
        });

    const matchingUsers = selectedBadges.size === 0 ? [] : voiceUsers.filter(({ userId }) => {
        const f = flagsMap.get(userId);
        return f != null && [...selectedBadges].some(b => (f & b) !== 0);
    });

    const byChannel = new Map<string, string[]>();
    for (const { userId, channelId } of matchingUsers) {
        const list = byChannel.get(channelId) ?? [];
        list.push(userId);
        byChannel.set(channelId, list);
    }

    const isFetching = fetchedCount < totalToFetch && totalToFetch > 0;

    // Renders the guild icon in each dropdown option
    const renderOptionPrefix = (option: { value: any; label: string; }) => {
        const guild = GuildStore.getGuild(option.value as string);
        const iconUrl = guild?.icon
            ? IconUtils.getGuildIconURL({ id: guild.id, icon: guild.icon, size: 32, canAnimate: false })
            : null;
        return (
            <div style={{ width: 24, height: 24, borderRadius: 6, overflow: "hidden", flexShrink: 0, background: "var(--background-modifier-selected)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {iconUrl
                    ? <img src={iconUrl} width={24} height={24} style={{ display: "block" }} alt="" />
                    : <span style={{ fontSize: 9, color: "var(--text-muted)", userSelect: "none" }}>
                        {guild?.name?.slice(0, 2) ?? "?"}
                    </span>
                }
            </div>
        );
    };

    // Renders voice-count pill + verified/partner badge in each dropdown option
    const renderOptionSuffix = (option: { value: any; label: string; }) => {
        const guildId = option.value as string;
        const guild = GuildStore.getGuild(guildId);
        const count = voiceCountsPerGuild.get(guildId) ?? 0;
        const isVerified = guild?.features?.has?.("VERIFIED") ?? false;
        const isPartnered = guild?.features?.has?.("PARTNERED") ?? false;

        return (
            <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0, marginLeft: 4 }}>
                {isVerified && (
                    <Tooltip text="Servidor Verificado">
                        {props => <span {...props}><VerifiedIcon size={14} /></span>}
                    </Tooltip>
                )}
                {isPartnered && (
                    <Tooltip text="Discord Partner">
                        {props => <span {...props}><PartnerIcon size={14} /></span>}
                    </Tooltip>
                )}
                {count > 0 && (
                    <span style={{
                        fontSize: 11,
                        color: "var(--text-positive)",
                        background: "var(--background-modifier-selected)",
                        padding: "1px 6px",
                        borderRadius: 10,
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                    }}>
                        {count} em call
                    </span>
                )}
            </div>
        );
    };

    return (
        <Dialog className={PopoutClasses.container} style={{ width: 360, padding: 16 }}>
            <ScrollerThin fade style={{ maxHeight: 520 }}>

                <Forms.FormTitle style={{ marginBottom: 4 }}>Badge Voice Finder</Forms.FormTitle>
                <Forms.FormText style={{ marginBottom: 12 }}>
                    Mostra quem está em call em um servidor, filtrado pelas badges do perfil. Só consulta perfis de quem está em call no momento.
                </Forms.FormText>

                {/* Guild selector */}
                <div>
                    <Forms.FormTitle tag="h5">Servidor</Forms.FormTitle>
                    <Forms.FormText style={{ marginBottom: 6 }}>
                        Servidores com pessoas em call aparecem primeiro. O número verde indica quantas estão em voice agora.
                    </Forms.FormText>
                    <SearchableSelect
                        placeholder="Selecionar servidor…"
                        options={guildOptions}
                        value={selectedGuildId}
                        onChange={v => setSelectedGuildId(v as string)}
                        closeOnSelect
                        maxVisibleItems={7}
                        renderOptionPrefix={renderOptionPrefix as any}
                        renderOptionSuffix={renderOptionSuffix as any}
                    />
                </div>

                {selectedGuildId && <>
                    <Divider style={{ margin: "12px 0" }} />

                    {/* Badge checkboxes */}
                    <div>
                        <Forms.FormTitle tag="h5">Filtrar por badge</Forms.FormTitle>
                        <Forms.FormText style={{ marginBottom: 8 }}>
                            Marque uma ou mais badges. Serão exibidos usuários que possuam <strong>pelo menos uma</strong> das badges selecionadas e estejam em call agora.
                        </Forms.FormText>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            {BADGES.map(b => (
                                <Checkbox
                                    key={b.flag}
                                    value={selectedBadges.has(b.flag)}
                                    onChange={() => toggleBadge(b.flag)}
                                    size={20}
                                >
                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        <img
                                            src={`${BADGE_CDN}${b.hash}.png`}
                                            width={20}
                                            height={20}
                                            alt={b.label}
                                        />
                                        <Text variant="text-sm/normal">{b.label}</Text>
                                    </div>
                                </Checkbox>
                            ))}
                        </div>
                    </div>

                    {/* Results */}
                    {selectedBadges.size > 0 && <>
                        <Divider style={{ margin: "12px 0" }} />

                        <div>
                            <Forms.FormTitle tag="h5">
                                Em call{isFetching
                                    ? ` — verificando ${fetchedCount}/${totalToFetch}…`
                                    : ""}
                            </Forms.FormTitle>
                            <Forms.FormText style={{ marginBottom: 8 }}>
                                {isFetching
                                    ? "Buscando perfis dos usuários em call. Apenas quem ainda não está em cache é consultado na API."
                                    : "Clique no nome do canal para entrar na call direto."}
                            </Forms.FormText>

                            {byChannel.size === 0 && !isFetching
                                ? <Forms.FormText>
                                    {voiceUsers.length === 0
                                        ? "Ninguém em call neste servidor no momento."
                                        : "Nenhum usuário em call possui as badges selecionadas."}
                                </Forms.FormText>
                                : [...byChannel.entries()].map(([channelId, userIds]) => {
                                    const channel = ChannelStore.getChannel(channelId);
                                    return (
                                        <div key={channelId} style={{ marginBottom: 10 }}>
                                            {/* Channel name row — click to join */}
                                            <div
                                                style={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: 4,
                                                    marginBottom: 4,
                                                    cursor: "pointer",
                                                    color: "var(--channels-default)",
                                                }}
                                                onClick={() => selectVoiceChannel(channelId)}
                                            >
                                                <SpeakerIcon />
                                                <Text variant="text-xs/semibold" style={{ textTransform: "uppercase", letterSpacing: "0.02em" }}>
                                                    {channel?.name ?? channelId}
                                                </Text>
                                            </div>

                                            {/* User rows */}
                                            {userIds.map(userId => {
                                                const user = UserStore.getUser(userId);
                                                const flags = flagsMap.get(userId) ?? 0;
                                                const matchedBadges = BADGES.filter(b =>
                                                    selectedBadges.has(b.flag) && (flags & b.flag) !== 0
                                                );

                                                return (
                                                    <div key={userId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0" }}>
                                                        <img
                                                            style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0 }}
                                                            src={user
                                                                ? IconUtils.getUserAvatarURL(user, false)
                                                                : "https://cdn.discordapp.com/embed/avatars/0.png"
                                                            }
                                                            alt=""
                                                        />
                                                        <Text variant="text-sm/semibold" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                            {user?.username ?? userId}
                                                        </Text>
                                                        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                                                            {matchedBadges.map(b => (
                                                                <Tooltip key={b.flag} text={b.label}>
                                                                    {props => (
                                                                        <img
                                                                            {...props}
                                                                            src={`${BADGE_CDN}${b.hash}.png`}
                                                                            width={20}
                                                                            height={20}
                                                                            alt={b.label}
                                                                        />
                                                                    )}
                                                                </Tooltip>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })
                            }
                        </div>
                    </>}
                </>}
            </ScrollerThin>
        </Dialog>
    );
}
