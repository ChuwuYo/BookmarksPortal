/**
 * 打包脚本：构建双浏览器产物并生成发布 zip + SHA256 校验文件。
 * 本地与 CI 共用同一逻辑（CI 的 package 任务直接调用本脚本）。
 *
 * 输出 dist/artifacts/：
 *   BookmarksPortal-chrome.zip
 *   BookmarksPortal-firefox.zip
 *   SHA256SUMS.txt
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST_DIR = join(ROOT, "dist");
const ARTIFACTS_DIR = join(DIST_DIR, "artifacts");

// 1. 构建
execFileSync(process.execPath, [join(ROOT, "build.mjs")], { stdio: "inherit" });

// 2. 打包（zip 内容为扩展根目录，manifest.json 位于 zip 顶层）
rmSync(ARTIFACTS_DIR, { recursive: true, force: true });
mkdirSync(ARTIFACTS_DIR, { recursive: true });

const sums = [];
for (const target of ["chrome", "firefox"]) {
  const filename = `BookmarksPortal-${target}.zip`;
  const zipPath = join(ARTIFACTS_DIR, filename);
  execFileSync("zip", ["-r", "-X", zipPath, "."], {
    cwd: join(DIST_DIR, target),
    stdio: "pipe",
  });

  const digest = createHash("sha256").update(readFileSync(zipPath)).digest("hex");
  sums.push(`${digest}  ${filename}`);
  console.log(`✔ ${filename} (sha256: ${digest.slice(0, 12)}…)`);
}

writeFileSync(join(ARTIFACTS_DIR, "SHA256SUMS.txt"), `${sums.join("\n")}\n`);
console.log(`✔ SHA256SUMS.txt -> ${join("dist", "artifacts")}`);
