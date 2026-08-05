/**
 * 零依赖构建脚本：将 src/ 与浏览器专属 manifest 组装为可加载的扩展目录。
 *
 * 用法：
 *   node build.mjs            构建全部目标
 *   node build.mjs chrome     仅构建 Chrome
 *   node build.mjs firefox    仅构建 Firefox
 *
 * 输出：dist/chrome/、dist/firefox/
 */

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(ROOT, "src");
const DIST_DIR = join(ROOT, "dist");

const TARGETS = ["chrome", "firefox"];

const requested = process.argv.slice(2);
const targets = requested.length > 0 ? requested : TARGETS;

for (const target of targets) {
  if (!TARGETS.includes(target)) {
    console.error(`Unknown target: ${target} (expected: ${TARGETS.join(", ")})`);
    process.exit(1);
  }

  const outDir = join(DIST_DIR, target);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  // 拷贝共享资源（html/css/js/icons/fonts），排除点文件（.DS_Store 等）
  cpSync(SRC_DIR, outDir, {
    recursive: true,
    filter: (source) => !basename(source).startsWith("."),
  });

  // 写入浏览器专属 manifest（校验 JSON 合法性）
  const manifestPath = join(ROOT, "manifests", `${target}.json`);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  writeFileSync(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`✔ Built ${target} -> ${join("dist", target)}`);
}
