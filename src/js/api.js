/**
 * 跨浏览器扩展 API 适配层。
 * Firefox 提供 Promise 风格的 browser.*，Chrome 提供回调风格的 chrome.*。
 * 统一封装为 Promise。
 */

const api = typeof browser !== "undefined" ? browser : chrome;

/**
 * 获取完整书签树。
 * @returns {Promise<Array>} 书签树根节点数组
 */
function getBookmarkTree() {
  if (typeof browser !== "undefined") {
    return browser.bookmarks.getTree();
  }
  return new Promise((resolve, reject) => {
    chrome.bookmarks.getTree((tree) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
      } else {
        resolve(tree);
      }
    });
  });
}

export { api, getBookmarkTree };
