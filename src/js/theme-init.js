/**
 * 首帧主题同步初始化脚本（在 <head> 中同步执行，彻底消除暗色模式 FOUC）。
 * 保持极简非 module 脚本以兼容 MV3 CSP (script-src 'self')。
 */
(function initThemeBeforePaint() {
  let mode = "system";
  try {
    const stored = localStorage.getItem("bookmarksPortalTheme");
    if (stored === "light" || stored === "dark" || stored === "system") {
      mode = stored;
    }
  } catch {
    // localStorage 不可用时回退 system
  }
  const prefersDark =
    typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = mode === "dark" || (mode === "system" && prefersDark);
  document.documentElement.classList.toggle("dark", dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#191b1d" : "#58505b");
})();
