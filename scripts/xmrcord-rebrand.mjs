// Xmrcord: re-apply the Equicord -> Xmrcord branding on user-visible surfaces.
// Idempotent (old strings won't match on a second run). Run after a plugin sync from
// upstream. Internal identifiers are deliberately left as-is: env names (EQUICORD_*),
// the equicordplugins dir, the equicord:// protocol, equicord.org / Equicloud / cloud
// backend URLs (real external services), DataStore keys (Equicord*), CSS class ids and
// code identifiers (isEquicordPlugin, EquicordSettings, getEquicordDonorBadges, IS_EQUIBOP).
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const EDITS = {
    "src/plugins/_core/settings.tsx": [
        ["Where to put the Equicord settings section", "Where to put the Xmrcord settings section"],
        ["Also copy Equicord info (Equicord, Electron, Chromium)", "Also copy Xmrcord info (Xmrcord, Electron, Chromium)"],
        ['title: "Equicord"', 'title: "Xmrcord"'],
        ["Equicord Settings", "Xmrcord Settings"],
        ["Equicord Updater", "Xmrcord Updater"],
        ["Equicord Cloud", "Xmrcord Cloud"],
        ["`Equicord ${gitHashShort}", "`Xmrcord ${gitHashShort}"],
    ],
    "src/shared/vencordUserAgent.ts": [
        ["`Equicord/${gitHash}", "`Xmrcord/${gitHash}"],
        ["`Equicord${gitRemote", "`Xmrcord${gitRemote"],
    ],
    "src/main/utils/constants.ts": [
        ['"..", "EquicordData", suffix', '"..", "XmrcordData", suffix'],
        ['"..", "Equicord", suffix', '"..", "Xmrcord", suffix'],
        ["[Equicord]", "[Xmrcord]"],
    ],
    "src/main/patcher.ts": [
        ["[Equicord]", "[Xmrcord]"],
        ['"..", "Equicord")', '"..", "Xmrcord")'],
    ],
    "src/Vencord.ts": [
        ["Equicord has been updated!", "Xmrcord has been updated!"],
        ["A new version of Equicord is available!", "A new version of Xmrcord is available!"],
    ],
    "scripts/build/common.mjs": [
        ["// Equicord ${gitHash}", "// Xmrcord ${gitHash}"],
    ],
    "src/api/Commands/index.ts": [
        ['username: "Equicord"', 'username: "Xmrcord"'],
    ],
    "src/api/SettingsSync/offline.ts": [
        ["Equicord Settings Backup", "Xmrcord Settings Backup"],
    ],
    "src/components/settings/tabs/changelog/NewPluginsSection.tsx": [
        ["This plugin is required for Equicord to function.", "This plugin is required for Xmrcord to function."],
    ],
    "src/components/settings/tabs/plugins/index.tsx": [
        ["Developer version of Equicord", "Developer version of Xmrcord"],
        ["Web Browser version of Equicord", "Web Browser version of Xmrcord"],
        ["This plugin is required for Equicord to function.", "This plugin is required for Xmrcord to function."],
    ],
    "src/components/settings/tabs/updater/index.tsx": [
        ["When enabled, Equicord will automatically", "When enabled, Xmrcord will automatically"],
        ["Receive a notification when Equicord finishes", "Receive a notification when Xmrcord finishes"],
        ["Equibop & Equicord", "Equibop & Xmrcord"],
        ["Equibop and Equicord are two separate things. This updater is for Equicord.", "Equibop and Xmrcord are two separate things. This updater is for Xmrcord."],
    ],
    "src/components/settings/tabs/vencord/NotificationSettings.tsx": [
        ["Always use Equicord notifications", "Always use Xmrcord notifications"],
    ],
    "src/components/settings/tabs/vencord/index.tsx": [
        ["Since you've contributed to Equicord you now have a cool new badge!", "Since you've contributed to Xmrcord you now have a cool new badge!"],
        ["Configure how Equicord behaves and integrates with Discord.", "Configure how Xmrcord behaves and integrates with Discord."],
        ["Equicord Settings", "Xmrcord Settings"],
    ],
    "src/plugins/_core/supportHelper.tsx": [
        ["Equicord DevBuild", "Xmrcord DevBuild"],
        ["Send Equicord debug info", "Send Xmrcord debug info"],
        ["Send Equicord plugin list", "Send Xmrcord plugin list"],
    ],
    "src/plugins/_api/badges/index.tsx": [
        ["Equicord Contributor", "Xmrcord Contributor"],
        ["Equicord Translator", "Xmrcord Translator"],
    ],
};

let total = 0;
for (const [rel, pairs] of Object.entries(EDITS)) {
    const path = join(ROOT, rel);
    let src;
    try { src = readFileSync(path, "utf8"); } catch { console.warn(`  skip (missing): ${rel}`); continue; }
    const before = src;
    for (const [from, to] of pairs) {
        const n = src.split(from).length - 1;
        if (n > 0) { src = src.split(from).join(to); total += n; console.log(`  ${rel}: ${n}x`); }
    }
    if (src !== before) writeFileSync(path, src);
}
console.log(`Xmrcord rebrand: ${total} replacement(s).`);
