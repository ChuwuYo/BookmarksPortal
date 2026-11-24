/**
 * 主题模块单元测试（纯 Node，验证无 document 环境可安全导入、三态逻辑及首帧脚本同步）。
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { STORAGE_KEYS } from "../src/js/storage.js";
import {
  MODES,
  THEME_COLORS,
  applyTheme,
  cycleTheme,
  getTheme,
  isDarkMode,
} from "../src/js/theme.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("theme.js", () => {
  it("纯 Node 环境无 document 时可安全导入且默认回退 system", () => {
    assert.deepEqual(MODES, ["system", "light", "dark"]);
    assert.equal(getTheme(), "system");
  });

  it("isDarkMode 正确计算三态与系统偏好组合", () => {
    assert.equal(isDarkMode("dark", false), true);
    assert.equal(isDarkMode("light", true), false);
    assert.equal(isDarkMode("system", true), true);
    assert.equal(isDarkMode("system", false), false);
  });

  it("cycleTheme 按 system -> light -> dark -> system 循环", () => {
    assert.equal(cycleTheme(), "light");
    assert.equal(getTheme(), "light");
    assert.equal(cycleTheme(), "dark");
    assert.equal(cycleTheme(), "system");
  });

  it("applyTheme 无 document 时不抛异常并返回暗色布尔值", () => {
    assert.equal(applyTheme("dark"), true);
    assert.equal(applyTheme("light"), false);
  });

  it("theme-init.js 中的存储键与配色与权威常量一致", () => {
    const initScript = readFileSync(join(ROOT, "src/js/theme-init.js"), "utf8");
    assert.ok(initScript.includes(`"${STORAGE_KEYS.THEME}"`), "theme-init.js 存储键不同步");
    assert.ok(initScript.includes(`"${THEME_COLORS.light}"`), "theme-init.js 亮色主题色不同步");
    assert.ok(initScript.includes(`"${THEME_COLORS.dark}"`), "theme-init.js 暗色主题色不同步");
  });
});
