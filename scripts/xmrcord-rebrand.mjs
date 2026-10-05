// Xmrcord: re-apply the Equicord -> Xmrcord branding on user-visible surfaces.
// Idempotent (the old strings simply won't match on a second run). Run after a
// plugin sync from upstream (which overwrites src/plugins). Internal symbols
// (VencordNative, window.Vencord, webpack, EQUICORD_* env names) are left as-is.
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
