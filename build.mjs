/**
 * 构建脚本：将 src/ 与浏览器专属 manifest 组装为可加载的扩展目录，
 * 并在构建期从当前文案生成 UI 字体子集。
 *
 * 用法：
 *   node build.mjs            构建全部目标
 *   node build.mjs chrome     仅构建 Chrome
 *   node build.mjs firefox    仅构建 Firefox
 *
 * 输出：dist/chrome/、dist/firefox/
 * 注意：字体子集化依赖 devDependencies（subset-font），需先 npm install。
 */

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SUBSET_FONT_NAME, buildSubsetFont } from "./scripts/subset-font.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(ROOT, "src");
const DIST_DIR = join(ROOT, "dist");

const TARGETS = ["chrome", "firefox"];

const requested = process.argv.slice(2);
const targets = requested.length > 0 ? requested : TARGETS;

// UI 字体子集：每次构建从当前文案现算字符集（文案变更自动同步）
const subsetFontBuffer = await buildSubsetFont();

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

  // 写入构建期生成的 UI 字体子集
  mkdirSync(join(outDir, "fonts"), { recursive: true });
  writeFileSync(join(outDir, "fonts", SUBSET_FONT_NAME), subsetFontBuffer);

  // 写入浏览器专属 manifest（校验 JSON 合法性）
  const manifestPath = join(ROOT, "manifests", `${target}.json`);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  writeFileSync(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`✔ Built ${target} -> ${join("dist", target)}`);
}
