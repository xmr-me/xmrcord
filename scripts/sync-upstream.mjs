// Xmrcord: pull the latest plugins from Equicord (which already includes Vencord's plugins)
// and re-apply the Xmrcord branding. Your own plugins in src/userplugins are left untouched.
//
//   node scripts/sync-upstream.mjs
//   corepack pnpm testTsc   # then verify, commit and push to ship it to everyone
//
// This refreshes src/plugins and src/equicordplugins only. If Equicord changes shared code
// (src/api, src/components, src/utils) that new plugins need, re-run the full rebase instead.

import { execSync } from "child_process";
import { cpSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UPSTREAM = "https://github.com/Equicord/Equicord.git";
const DIRS = ["src/plugins", "src/equicordplugins"];

const tmp = mkdtempSync(join(tmpdir(), "equicord-sync-"));
try {
    console.log("Baixando o Equicord mais recente…");
    execSync(`git clone --depth 1 ${UPSTREAM} "${tmp}"`, { stdio: "inherit" });

    for (const dir of DIRS) {
        const src = join(tmp, dir);
        const dst = join(ROOT, dir);
        console.log(`Atualizando ${dir}…`);
        rmSync(dst, { recursive: true, force: true });
        cpSync(src, dst, { recursive: true });
    }
} finally {
    rmSync(tmp, { recursive: true, force: true });
}

console.log("Reaplicando a marca Xmrcord…");
execSync("node scripts/xmrcord-rebrand.mjs", { cwd: ROOT, stdio: "inherit" });

console.log("\nPronto. Rode `corepack pnpm testTsc` e, se passar, commit + push para distribuir.");
