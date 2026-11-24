/**
 * 统一本地存储封装（localStorage）。
 * 集中管理键名并统一处理不可用/配额/解析异常，保持纯 Node 环境可安全导入。
 */

const STORAGE_KEYS = Object.freeze({
  OPTIONS: "bookmarksPortalOptions",
  LANG: "bookmarksPortalLang",
  THEME: "bookmarksPortalTheme",
});

/**
 * 读取字符串值，不可用时返回 null。
 * @param {string} key
 * @returns {string|null}
 */
function readStorage(key) {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * 写入字符串值，失败时返回 false。
 * @param {string} key
 * @param {string} value
 * @returns {boolean}
 */
function writeStorage(key, value) {
  try {
    if (typeof localStorage === "undefined") return false;
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/**
 * 读取并解析 JSON 值；区分「未存储」与「解析失败」。
 * @param {string} key
 * @returns {{ ok: true, value: any } | { ok: false, error: any }}
 */
function readJsonStorage(key) {
  try {
    if (typeof localStorage === "undefined") return { ok: true, value: null };
    const raw = localStorage.getItem(key);
    if (raw === null) return { ok: true, value: null };
    return { ok: true, value: JSON.parse(raw) };
  } catch (error) {
    return { ok: false, error };
  }
}

/**
 * 序列化并写入 JSON 值（不可序列化为 JSON 的值如 undefined 返回 false）。
 * @param {string} key
 * @param {*} value
 * @returns {boolean}
 */
function writeJsonStorage(key, value) {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) return false;
    return writeStorage(key, serialized);
  } catch {
    return false;
  }
}

export { STORAGE_KEYS, readJsonStorage, readStorage, writeJsonStorage, writeStorage };
