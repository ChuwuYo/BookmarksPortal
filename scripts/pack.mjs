/**
 * 打包脚本：构建双浏览器产物并生成发布 zip + SHA256 校验文件。
 * 本地与 CI 共用同一逻辑（CI 的 package 任务直接调用本脚本）。
 * zip 写入使用 yazl（纯 Node 实现），不依赖系统 zip 命令，跨平台可复现。
 *
 * 输出 dist/artifacts/：
 *   BookmarksPortal-chrome.zip
 *   BookmarksPortal-firefox.zip
 *   SHA256SUMS.txt
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createWriteStream,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ZipFile } from "yazl";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST_DIR = join(ROOT, "dist");
const ARTIFACTS_DIR = join(DIST_DIR, "artifacts");

/**
 * 以纯 Node 方式将目录打包为 zip（manifest.json 位于顶层）。
 * 条目按路径排序并固定 mtime/mode，保证相同源码产出字节一致的 zip（可复现构建）。
 * @param {string} srcDir
 * @param {string} outPath
 */
function zipDirectory(srcDir, outPath) {
  const zip = new ZipFile();
  // DOS 纪元：zip 可表示的最早时间，固定后产物与构建时间无关
  const FIXED_MTIME = new Date("1980-01-01T00:00:00Z");

  const walk = (dir, prefix) => {
    const entries = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => !entry.name.startsWith("."))
      .sort((a, b) => a.name.localeCompare(b.name, "en"));
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const zipPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(fullPath, zipPath);
      } else {
        zip.addFile(fullPath, zipPath, { mtime: FIXED_MTIME, mode: 0o100644 });
      }
    }
  };
  walk(srcDir, "");

  return new Promise((resolve, reject) => {
    const output = createWriteStream(outPath);
    output.on("close", resolve);
    output.on("error", reject);
    zip.on("error", reject);
    zip.outputStream.on("error", reject);
    zip.outputStream.pipe(output);
    zip.end();
  });
}

// 1. 构建
execFileSync(process.execPath, [join(ROOT, "build.mjs")], { stdio: "inherit" });

// 2. 打包
rmSync(ARTIFACTS_DIR, { recursive: true, force: true });
mkdirSync(ARTIFACTS_DIR, { recursive: true });

const sums = [];
for (const target of ["chrome", "firefox"]) {
  const filename = `BookmarksPortal-${target}.zip`;
  const zipPath = join(ARTIFACTS_DIR, filename);
  await zipDirectory(join(DIST_DIR, target), zipPath);

  const digest = createHash("sha256").update(readFileSync(zipPath)).digest("hex");
  sums.push(`${digest}  ${filename}`);
  console.log(`✔ ${filename} (sha256: ${digest.slice(0, 12)}…)`);
}

writeFileSync(join(ARTIFACTS_DIR, "SHA256SUMS.txt"), `${sums.join("\n")}\n`);
console.log(`✔ SHA256SUMS.txt -> ${join("dist", "artifacts")}`);
