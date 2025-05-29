// DOMContentLoaded 事件会在 HTML 文档被完全加载和解析完成后触发
// 缓存DOM元素和状态
const domCache = {};
let bookmarksData = null;
let currentLang = navigator.language.startsWith('zh') ? 'zh' : 'en';

document.addEventListener('DOMContentLoaded', initializeApp);

/**
 * 初始化应用程序
 */
function initializeApp() {
  cacheDOMElements();
  applyLanguage();
  setupEventListeners();
  loadBookmarks();
}

/**
 * 缓存常用DOM元素
 */
function cacheDOMElements() {
  ['title', 'selectAll', 'deselectAll', 'exportButton', 'languageToggle', 'bookmarkList', 'loadOptionsButton'].forEach(id => {
    const element = document.getElementById(id);
    if (!element) {
      console.error(`Element with id ${id} not found`);
      return;
    }
    domCache[id] = element;
  });
}

/**
 * 设置事件监听器
 */
function setupEventListeners() {
  // 使用事件委托处理按钮点击
  const buttonGroup = document.querySelector('.button-group');
  if (buttonGroup) {
    buttonGroup.addEventListener('click', handleButtonClick);
  } else {
    console.error('Button group not found');
  }

  // 语言切换按钮事件
  domCache.languageToggle.addEventListener('click', toggleLanguage);

  // 加载上次选项按钮事件
  domCache.loadOptionsButton.addEventListener('click', loadCheckedOptions);
}

/**
 * 切换语言
 */
function toggleLanguage() {
  currentLang = currentLang === 'zh' ? 'en' : 'zh';
  applyLanguage();
}

/**
 * 加载书签
 */
function loadBookmarks() {
  // 记录加载开始时间
  const loadStartTime = Date.now();

  // 获取并展示完整书签树
  chrome.bookmarks.getTree(bookmarkTree => {
    const bookmarkBar = bookmarkTree[0].children[0];  // 书签栏节点
    bookmarksData = bookmarkBar.children; // 缓存书签数据
    renderBookmarkTree(bookmarksData);

    // 确保加载动画至少显示 MIN_LOADING_TIME ms
    const MIN_LOADING_TIME = 500; // 毫秒
    const elapsedTime = Date.now() - loadStartTime;
    const container = document.querySelector('.container');

    if (container) {
      if (elapsedTime < MIN_LOADING_TIME) {
        setTimeout(() => {
          container.classList.remove('loading');
        }, MIN_LOADING_TIME - elapsedTime);
      } else {
        container.classList.remove('loading');
      }
    }
  });
}

/**
 * 使用事件委托处理按钮点击
 */
function handleButtonClick(event) {
  const target = event.target;
  
  if (target.id === 'selectAll') {
    toggleAllCheckboxes(true);
  } else if (target.id === 'deselectAll') {
    toggleAllCheckboxes(false);
  } else if (target.id === 'exportButton') {
    exportSelectedBookmarks();
  }
}

/**
 * 渲染书签树
 */
function renderBookmarkTree(nodes) {
  const container = document.getElementById('bookmarkList');
  container.innerHTML = '';
  
  nodes.forEach(node => {
    container.appendChild(createTreeNode(node));
  });
}

/**
 * 创建树节点
 */
function createTreeNode(node, depth = 0) {
  const item = document.createElement('div');
  item.className = 'bookmark-node';

  const header = createNodeHeader(node, depth, item);
  item.appendChild(header);

  // 递归处理子节点
  if (node.children) {
    const childrenContainer = document.createElement('div');
    childrenContainer.className = 'children-container';
    childrenContainer.style.display = 'none';

    node.children.forEach(child => {
      childrenContainer.appendChild(createTreeNode(child, depth + 1));
    });
    item.appendChild(childrenContainer);
  }

  return item;
}

/**
 * 创建节点头部
 */
function createNodeHeader(node, depth, parentItem) {
  const header = document.createElement('div');
  header.className = 'node-header';
  header.style.paddingLeft = `${depth * 16}px`;

  // 文件夹展开按钮
  if (node.children) {
    const toggleBtn = document.createElement('span');
    toggleBtn.className = 'toggle-btn collapsed';
    toggleBtn.textContent = '▶';
    toggleBtn.addEventListener('click', () => toggleChildren(parentItem));
    header.appendChild(toggleBtn);
  }

  // 复选框
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'node-checkbox';
  checkbox.id = `checkbox-${node.id}`;
  checkbox.dataset.id = node.id;
  header.appendChild(checkbox);

  // 图标
  const icon = document.createElement('span');
  icon.className = node.url ? 'link-icon' : 'folder-icon';
  icon.textContent = node.url ? '🌐' : '📁';
  header.appendChild(icon);

  // 标题
  const title = document.createElement('span');
  title.className = 'node-title';
  title.textContent = node.title;
  header.appendChild(title);

  // 复选框状态变化时更新子节点和父节点
  checkbox.addEventListener('change', () => {
    const checked = checkbox.checked;
    toggleChildCheckboxes(parentItem, checked);
    updateParentCheckbox(parentItem);
  });

  return header;
}

/**
 * 展开/收起子节点
 */
function toggleChildren(container) {
  const children = container.querySelector('.children-container');
  const toggleBtn = container.querySelector('.toggle-btn');

  if (children.style.display === 'none') {
    children.style.display = 'block';
    toggleBtn.textContent = '▼';
    toggleBtn.classList.replace('collapsed', 'expanded');
  } else {
    children.style.display = 'none';
    toggleBtn.textContent = '▶';
    toggleBtn.classList.replace('expanded', 'collapsed');
  }
}

/**
 * 全选/取消功能
 */
function toggleAllCheckboxes(checked) {
  // 先重置所有复选框的状态
  document.querySelectorAll('.node-checkbox').forEach(checkbox => {
    checkbox.checked = checked;
    checkbox.indeterminate = false; // 重置部分选中状态
  });

  // 更新所有父节点的状态
  document.querySelectorAll('.bookmark-node').forEach(node => {
    if (node.querySelector('.children-container')) {
      updateParentCheckbox(node);
    }
  });
}

/**
 * 递归勾选/取消子节点
 */
function toggleChildCheckboxes(container, checked) {
  const childCheckboxes = container.querySelectorAll('.children-container .node-checkbox');
  childCheckboxes.forEach(cb => {
    cb.checked = checked;
    cb.indeterminate = false;
  });
}

/**
 * 更新父节点的勾选状态
 */
function updateParentCheckbox(container) {
  const parentContainer = container.parentElement.closest('.bookmark-node');
  if (!parentContainer) return;

  const parentCheckbox = parentContainer.querySelector(':scope > .node-header > .node-checkbox');
  // 使用直接子容器下的复选框进行判断
  const childCheckboxes = parentContainer.querySelectorAll(':scope > .children-container > .bookmark-node > .node-header > .node-checkbox');

  if (childCheckboxes.length === 0) {
    // 如果没有子复选框，父节点的 indeterminate 状态应为 false
    if (parentCheckbox) parentCheckbox.indeterminate = false;
    // 递归更新上层父节点
    updateParentCheckbox(parentContainer);
    return;
  }

  let checkedCount = 0;
  let indeterminateCount = 0;
  childCheckboxes.forEach(cb => {
    if (cb.checked) {
      checkedCount++;
    } else if (cb.indeterminate) {
      indeterminateCount++;
    }
  });

  const totalCount = childCheckboxes.length;

  if (indeterminateCount > 0 || (checkedCount > 0 && checkedCount < totalCount)) {
    parentCheckbox.checked = false;
    parentCheckbox.indeterminate = true;
  } else if (checkedCount === totalCount) {
    parentCheckbox.checked = true;
    parentCheckbox.indeterminate = false;
  } else { // checkedCount === 0 && indeterminateCount === 0
    parentCheckbox.checked = false;
    parentCheckbox.indeterminate = false;
  }

  // 递归更新上层父节点
  updateParentCheckbox(parentContainer);
}

/**
 * 处理书签节点
 */
async function processBookmarkNode(node) {
  if (node.url) {
    let hostname = '';
    try {
      hostname = new URL(node.url).hostname;
    } catch (e) {
      console.warn('Invalid URL:', node.url);
    }
    return {
      type: 'link',
      addDate: node.dateAdded,
      title: node.title,
      url: node.url,
      icon: hostname ? `https://www.google.com/s2/favicons?domain=${hostname}` : ''
    };
  } else if (node.children) {
    const processed = await Promise.all(node.children.map(child => processBookmarkNode(child)));
    return {
      type: 'folder',
      addDate: node.dateAdded,
      title: node.title,
      children: processed
    };
  }
}

/**
 * 保存当前未勾选状态到localStorage
 */
function saveCheckedOptions() {
  const allCheckboxes = document.querySelectorAll('.node-checkbox');
  const uncheckedIds = [];

  allCheckboxes.forEach(checkbox => {
    // 只保存明确未选中的项（非checked且非indeterminate）
    if (!checkbox.checked && !checkbox.indeterminate) {
      uncheckedIds.push(checkbox.dataset.id);
    }
  });

  const savedOptions = {
    uncheckedIds, // 保存未选中的ID
    timestamp: Date.now()
  };

  localStorage.setItem('bookmarksPortalOptions', JSON.stringify(savedOptions));
  console.log('Saved unchecked options:', uncheckedIds); // 添加日志方便调试
}

/**
 * 加载上次勾选状态（新逻辑：全选 - 取消上次未选的）
 */
function loadCheckedOptions() {
  const savedOptionsStr = localStorage.getItem('bookmarksPortalOptions');
  if (!savedOptionsStr) {
    alert(translations[currentLang].noSavedOptions);
    return;
  }

  try {
    // 显示加载状态
    const loadButton = domCache.loadOptionsButton;
    loadButton.classList.add('loading');

    // 记录开始时间，用于确保最短动画时长
    const startTime = Date.now();

    const savedOptions = JSON.parse(savedOptionsStr);
    const { uncheckedIds } = savedOptions; // 获取未选中的ID

    console.log('Loading unchecked options:', uncheckedIds); // 添加日志方便调试

    // 1. 全选所有项目
    toggleAllCheckboxes(true);

    // 2. 取消勾选上次未选中的项目
    uncheckedIds.forEach(id => {
      const checkbox = document.querySelector(`.node-checkbox[data-id="${id}"]`);
      if (checkbox) {
        checkbox.checked = false;
      }
    });

    // 3. 统一更新所有父节点的勾选状态
    // 遍历所有包含子节点的 bookmark-node，从底层向上更新状态
    const folderNodes = document.querySelectorAll('.bookmark-node');
    // 反向遍历以确保子节点状态先确定
    for (let i = folderNodes.length - 1; i >= 0; i--) {
      const node = folderNodes[i];
      // 检查是否是文件夹（通过是否有子容器判断）
      if (node.querySelector('.children-container')) {
        // 找到它的直接子节点的复选框来更新状态
        const directChildrenCheckboxes = node.querySelectorAll(':scope > .children-container > .bookmark-node > .node-header > .node-checkbox');
        if (directChildrenCheckboxes.length > 0) {
          updateParentCheckboxBasedOnDirectChildren(node);
        }
      }
    }

    // 计算已经过去的时间
    const elapsedTime = Date.now() - startTime;
    const minAnimationTime = 500; // 最短动画时间为0.5秒

    // 如果已经过去的时间小于最短动画时间，则延迟恢复按钮状态
    if (elapsedTime < minAnimationTime) {
      setTimeout(() => {
        loadButton.classList.remove('loading');
      }, minAnimationTime - elapsedTime);
    } else {
      loadButton.classList.remove('loading');
    }
  } catch (error) {
    console.error('Error loading options:', error);
    alert(translations[currentLang].loadError);
    domCache.loadOptionsButton.classList.remove('loading');
  }
}

/**
 * 根据直接子节点的勾选状态更新父节点
 */
function updateParentCheckboxBasedOnDirectChildren(parentNode) {
  const parentCheckbox = parentNode.querySelector(':scope > .node-header > .node-checkbox');
  if (!parentCheckbox) return; // 如果找不到父复选框，则退出

  const childCheckboxes = parentNode.querySelectorAll(':scope > .children-container > .bookmark-node > .node-header > .node-checkbox');
  if (childCheckboxes.length === 0) {
    // 没有子项，不应是 indeterminate
    parentCheckbox.indeterminate = false;
    return;
  }

  let checkedCount = 0;
  let indeterminateCount = 0;
  childCheckboxes.forEach(cb => {
    if (cb.checked) {
      checkedCount++;
    } else if (cb.indeterminate) {
      indeterminateCount++;
    }
  });

  const totalCount = childCheckboxes.length;

  if (indeterminateCount > 0 || (checkedCount > 0 && checkedCount < totalCount)) {
    // 如果有子节点是 indeterminate，或者部分子节点被选中，则父节点是 indeterminate
    parentCheckbox.checked = false;
    parentCheckbox.indeterminate = true;
  } else if (checkedCount === totalCount) {
    // 所有子节点都被选中
    parentCheckbox.checked = true;
    parentCheckbox.indeterminate = false;
  } else { // checkedCount === 0 && indeterminateCount === 0
    // 所有子节点都未被选中
    parentCheckbox.checked = false;
    parentCheckbox.indeterminate = false;
  }
}

/**
 * 导出选中的书签
 */
async function exportSelectedBookmarks() {
  const selectedCheckboxes = document.querySelectorAll('.node-checkbox:checked');
  if (selectedCheckboxes.length === 0) {
    alert(translations[currentLang].noSelection);
    return;
  }

  // 保存本次勾选状态到localStorage
  saveCheckedOptions();

  // 显示加载状态
  const exportButton = domCache.exportButton;
  const originalText = exportButton.textContent;
  exportButton.disabled = true;
  exportButton.textContent = translations[currentLang].exporting;
  exportButton.classList.add('loading');

  // 记录开始时间，用于确保最短动画时长
  const startTime = Date.now();

  try {
    // 获取完整的书签树
    const [rootNode] = await new Promise(resolve => chrome.bookmarks.getTree(resolve));
    const bookmarkBar = rootNode.children[0]; // 书签栏节点

    // 获取浏览器界面语言，并确定要使用的语言键
    const browserUILang = chrome.i18n.getUILanguage();
    const exportLang = browserUILang && browserUILang.startsWith('zh') ? 'zh' : 'en';

    // 创建导出数据的基本结构
    const exportData = [{
      type: 'folder',
      addDate: Date.now(),
      title: translations[exportLang].bookmarksBar, // 使用浏览器界面语言对应的书签栏标题
      children: []
    }];

    // 获取所有选中的节点ID和部分选中的节点ID
    const selectedCheckboxesArray = Array.from(selectedCheckboxes);
    const selectedIds = new Set(selectedCheckboxesArray.map(cb => cb.dataset.id));

    // 添加部分选中的节点ID
    const indeterminateCheckboxes = document.querySelectorAll('.node-checkbox:indeterminate');
    const indeterminateIds = new Set(Array.from(indeterminateCheckboxes).map(cb => cb.dataset.id));

    // 合并选中和部分选中的节点ID
    const allRelevantIds = new Set([...selectedIds, ...indeterminateIds]);

    // 批量处理书签栏的直接子节点
    exportData[0].children = bookmarkBar.children
      .filter(child => selectedIds.has(child.id) || indeterminateIds.has(child.id))
      .map(child => processNodeForExport(child, selectedIds, indeterminateIds))
      .filter(Boolean);

    // 导出为文件
    downloadBookmarks(exportData);
  } catch (error) {
    console.error('Error exporting bookmarks:', error);
    alert(translations[currentLang].exportError);
  } finally {
    finishExport(exportButton, originalText, startTime);
  }
}

/**
 * 处理节点用于导出
 */
function processNodeForExport(node, selectedIds, indeterminateIds) {
  if (node.url) {
    let hostname = '';
    try {
      hostname = new URL(node.url).hostname;
    } catch (e) {
      console.warn('Invalid URL:', node.url);
    }
    return {
      type: 'link',
      addDate: Number(node.dateAdded),
      title: node.title,
      url: node.url,
      icon: hostname ? `https://www.google.com/s2/favicons?domain=${hostname}` : ''
    };
  } else if (node.children) {
    // 使用allRelevantIds来过滤子节点，包括部分选中的节点
    const processedChildren = node.children
      .filter(child => selectedIds.has(child.id) || indeterminateIds.has(child.id))
      .map(child => processNodeForExport(child, selectedIds, indeterminateIds))
      .filter(Boolean);

    // 如果节点本身被选中，或者是部分选中状态，或者有处理后的子节点，则保留该节点
    if (processedChildren.length > 0 || selectedIds.has(node.id) || indeterminateIds.has(node.id)) {
      return {
        type: 'folder',
        addDate: Number(node.dateAdded),
        title: node.title,
        children: processedChildren
      };
    }
  }
  return null;
}

/**
 * 下载书签文件
 */
function downloadBookmarks(exportData) {
  const jsonStr = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const localDate = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).replace(/\//g, '-'); // 将日期格式化为 YYYY-MM-DD
  a.download = `bookmarks⏰${localDate}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 完成导出过程
 */
function finishExport(exportButton, originalText, startTime) {
  // 计算已经过去的时间
  const elapsedTime = Date.now() - startTime;
  const minAnimationTime = 1000; // 最短动画时间为1秒

  // 如果已经过去的时间小于最短动画时间，则延迟恢复按钮状态
  if (elapsedTime < minAnimationTime) {
    setTimeout(() => {
      // 恢复按钮状态
      exportButton.disabled = false;
      exportButton.textContent = originalText;
      exportButton.classList.remove('loading'); // 移除loading类，停止加载动画
    }, minAnimationTime - elapsedTime);
  } else {
    // 已经超过最短动画时间，直接恢复按钮状态
    exportButton.disabled = false;
    exportButton.textContent = originalText;
    exportButton.classList.remove('loading'); // 移除loading类，停止加载动画
  }
}

const translations = {
  zh: {
    title: "选择要导出的书签",
    selectAll: "选中所有",
    deselectAll: "取消全选",
    exportButton: "导出书签",
    exporting: "导出中...",
    noSelection: "请至少选择一个项目！",
    exportError: "导出过程中发生错误，请查看控制台以了解详情。",
    bookmarksBar: "书签栏",
    loading: "加载中...",
    success: "导出成功！",
    folderName: "文件夹",
    linkName: "链接",
    noSavedOptions: "没有找到已保存的选项！",
    loadError: "加载选项时发生错误，请查看控制台以了解详情。",
    loadOptions: "加载上次选择",
    back: "返回"
  },
  en: {
    title: "Select Your Bookmarks",
    selectAll: "Select All",
    deselectAll: "Deselect All",
    exportButton: "Transmit !!",
    exporting: "Exporting...",
    noSelection: "Please select at least one item!",
    exportError: "Error occurred during export, please check console for details.",
    bookmarksBar: "Bookmarks Bar",
    loading: "Loading...",
    success: "Export successful!",
    folderName: "Folder",
    linkName: "Link",
    noSavedOptions: "No saved options found!",
    loadError: "Error loading options, please check console for details.",
    loadOptions: "Load Last Selection",
    back: "Back"
  }
};

/**
 * 应用语言设置
 */
function applyLanguage() {
  // 使用缓存的DOM元素，避免重复查询
  domCache.title.textContent = translations[currentLang].title;
  domCache.selectAll.textContent = translations[currentLang].selectAll;
  domCache.deselectAll.textContent = translations[currentLang].deselectAll;
  domCache.exportButton.textContent = translations[currentLang].exportButton;
  domCache.loadOptionsButton.setAttribute('aria-label', translations[currentLang].loadOptions);
}