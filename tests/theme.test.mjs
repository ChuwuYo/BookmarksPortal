/**
 * 主题模块单元测试（纯 Node，验证无 document 环境可安全导入与三态逻辑）。
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MODES, applyTheme, cycleTheme, getTheme, isDarkMode } from "../src/js/theme.js";

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
});
