// Xmrcord: pull the latest plugins from Equicord (which already includes Vencord's plugins)
// and re-apply the Xmrcord branding. Your own plugins are preserved.
//
//   node scripts/sync-upstream.mjs
//   corepack pnpm testTsc   # then verify, commit and push to ship it to everyone
//
// This refreshes src/plugins and src/equicordplugins only. If Equicord changes shared code
// (src/api, src/components, src/utils) that new plugins need, re-run the full rebase instead.

import { execSync } from "child_process";
import { cpSync, existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UPSTREAM = "https://github.com/Equicord/Equicord.git";
const DIRS = ["src/plugins", "src/equicordplugins"];

// Our own plugins live inside src/equicordplugins — keep them across a sync.
const OURS = ["badgeVoiceFinder", "messageCleaner", "serverFaker", "followVoiceUser"];

const tmp = mkdtempSync(join(tmpdir(), "equicord-sync-"));
const keep = mkdtempSync(join(tmpdir(), "xmr-keep-"));
try {
    console.log("Baixando o Equicord mais recente…");
    execSync(`git clone --depth 1 ${UPSTREAM} "${tmp}"`, { stdio: "inherit" });

    // stash our plugins
    for (const p of OURS) {
        const src = join(ROOT, "src/equicordplugins", p);
        if (existsSync(src)) cpSync(src, join(keep, p), { recursive: true });
    }

    for (const dir of DIRS) {
        console.log(`Atualizando ${dir}…`);
        rmSync(join(ROOT, dir), { recursive: true, force: true });
        cpSync(join(tmp, dir), join(ROOT, dir), { recursive: true });
    }

    // restore our plugins
    for (const p of OURS) {
        const src = join(keep, p);
        if (existsSync(src)) cpSync(src, join(ROOT, "src/equicordplugins", p), { recursive: true });
    }
} finally {
    rmSync(tmp, { recursive: true, force: true });
    rmSync(keep, { recursive: true, force: true });
}

console.log("Reaplicando a marca Xmrcord…");
execSync("node scripts/xmrcord-rebrand.mjs", { cwd: ROOT, stdio: "inherit" });

console.log("\nPronto. Rode `corepack pnpm testTsc` e, se passar, commit + push para distribuir.");
