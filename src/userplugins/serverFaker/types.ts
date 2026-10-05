/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 s0i4x and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface GuildFakeConfig {
    /** Faked total member count. Empty string = leave the real value. */
    memberCount: string;
    /** Faked online member count (fixed number). Empty string = leave the real value. Ignored when onlinePercent > 0. */
    onlineCount: string;
    /** If > 0, online count = round(total * onlinePercent / 100). Takes priority over onlineCount. 0 = off. */
    onlinePercent: number;

    /** Add the VERIFIED guild feature (verified checkmark). */
    verified: boolean;
    /** Add the PARTNERED guild feature (partner badge). */
    partnered: boolean;

    /** Whether to override the server boost level/count. */
    boost: boolean;
    /** Faked premium (boost) tier, 0-3. */
    boostTier: number;
    /** Faked boost subscriber count. Empty string = leave the real value. */
    boostCount: string;
}

export function makeDefaultConfig(): GuildFakeConfig {
    return {
        memberCount: "",
        onlineCount: "",
        onlinePercent: 0,
        verified: false,
        partnered: false,
        boost: false,
        boostTier: 3,
        boostCount: "",
    };
}

/** Parse a user-typed count into a non-negative integer, or null if blank/invalid. */
export function parseCount(value: string | null | undefined): number | null {
    if (value == null) return null;
    const trimmed = String(value).trim();
    if (trimmed === "") return null;
    const n = Number(trimmed.replace(/[,_\s]/g, ""));
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

/** Whether a config changes the guild record itself (features / boost), as opposed to only counts. */
export function affectsGuildRecord(cfg: GuildFakeConfig): boolean {
    return cfg.verified || cfg.partnered || cfg.boost;
}

/** Whether a config does anything at all. */
export function isActive(cfg: GuildFakeConfig | undefined): boolean {
    if (!cfg) return false;
    return (
        cfg.verified ||
        cfg.partnered ||
        cfg.boost ||
        cfg.onlinePercent > 0 ||
        parseCount(cfg.memberCount) != null ||
        parseCount(cfg.onlineCount) != null
    );
}
