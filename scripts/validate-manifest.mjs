/**
 * manifest 校验：双浏览器 manifest 与 package.json 的版本一致性、
 * 必需字段、引用资源存在性。
 *
 * 发布守卫链的一部分：CI 的 release 任务要求 tag v* 与此处版本完全一致。
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const errors = [];
const check = (condition, message) => {
  if (!condition) errors.push(message);
};

const readJson = (path) => JSON.parse(readFileSync(join(ROOT, path), "utf8"));

const pkg = readJson("package.json");
const chrome = readJson("manifests/chrome.json");
const firefox = readJson("manifests/firefox.json");

// ---- 版本一致性（发布守卫的根基）----
const SEMVER_RE = /^\d+\.\d+\.\d+$/;
for (const [name, version] of [
  ["package.json", pkg.version],
  ["manifests/chrome.json", chrome.version],
  ["manifests/firefox.json", firefox.version],
]) {
  check(SEMVER_RE.test(version), `${name} 版本号 "${version}" 不是合法 semver`);
}
check(
  chrome.version === firefox.version && chrome.version === pkg.version,
  `版本不一致: package.json=${pkg.version}, chrome=${chrome.version}, firefox=${firefox.version}`
);

// ---- 共同字段 ----
for (const [name, manifest] of [
  ["chrome", chrome],
  ["firefox", firefox],
]) {
  check(manifest.manifest_version === 3, `${name}: manifest_version 必须为 3`);
  check(typeof manifest.name === "string" && manifest.name.length > 0, `${name}: 缺少 name`);
  check(
    manifest.action?.default_popup === "popup.html",
    `${name}: action.default_popup 必须为 popup.html`
  );
  check(
    Array.isArray(manifest.permissions) && manifest.permissions.includes("bookmarks"),
    `${name}: permissions 必须包含 bookmarks`
  );

  // 引用的图标必须存在于 src/icons
  for (const iconPath of Object.values(manifest.icons ?? {})) {
    check(existsSync(join(ROOT, "src", iconPath)), `${name}: 图标缺失 src/${iconPath}`);
  }

  // 最小权限守卫：不得重新引入历史遗留的多余权限
  const banned = ["storage", "unlimitedStorage"];
  for (const permission of manifest.permissions ?? []) {
    check(!banned.includes(permission), `${name}: 不允许的权限 ${permission}`);
  }
  check(!("host_permissions" in manifest), `${name}: 不应声明 host_permissions（扩展零网络请求）`);
}

// ---- 浏览器专属 ----
check(typeof firefox.browser_specific_settings?.gecko?.id === "string", "firefox: 缺少 gecko id");
check(!("browser_specific_settings" in chrome), "chrome: 不应包含 browser_specific_settings");

// popup.html 引用的字体必须存在
check(
  existsSync(join(ROOT, "src/fonts/AlibabaHealthFont2.0CN-45R.woff2")),
  "字体文件缺失: src/fonts/AlibabaHealthFont2.0CN-45R.woff2"
);

if (errors.length > 0) {
  console.error("Manifest 校验失败:");
  for (const error of errors) console.error(`  ✘ ${error}`);
  process.exit(1);
}
console.log(`✔ Manifest 校验通过 (v${chrome.version})`);
