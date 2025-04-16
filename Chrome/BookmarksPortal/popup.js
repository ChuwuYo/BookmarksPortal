// DOMContentLoaded 事件会在 HTML 文档被完全加载和解析完成后触发
// 缓存DOM元素和状态
const domCache = {};
let bookmarksData = null;

document.addEventListener('DOMContentLoaded', () => {
  // 缓存常用DOM元素
  ['title', 'selectAll', 'deselectAll', 'exportButton', 'languageToggle', 'bookmarkList', 'loadOptionsButton'].forEach(id => {
    const element = document.getElementById(id);
    if (!element) {
      console.error(`Element with id ${id} not found`);
      return;
    }
    domCache[id] = element;
  });

  // 初始化语言
  applyLanguage();

  // 使用事件委托处理按钮点击
  const buttonGroup = document.querySelector('.button-group');
  if (buttonGroup) {
    buttonGroup.addEventListener('click', handleButtonClick);
  } else {
    console.error('Button group not found');
  }

  // 语言切换按钮事件
  domCache.languageToggle.addEventListener('click', () => {
    currentLang = currentLang === 'zh' ? 'en' : 'zh';
    applyLanguage();
  });

  // 加载上次选项按钮事件
  domCache.loadOptionsButton.addEventListener('click', loadCheckedOptions);

  // 获取并展示完整书签树
  chrome.bookmarks.getTree(bookmarkTree => {
    const bookmarkBar = bookmarkTree[0].children[0];  // 书签栏节点
    bookmarksData = bookmarkBar.children; // 缓存书签数据
    renderBookmarkTree(bookmarksData);
  });
});

// 使用事件委托处理按钮点击
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

function renderBookmarkTree(nodes) {
  const container = document.getElementById('bookmarkList');
  container.innerHTML = '';
  nodes.forEach(node => {
    container.appendChild(createTreeNode(node));
  });
}

function createTreeNode(node, depth = 0) {
  const item = document.createElement('div');
  item.className = 'bookmark-node';

  const header = document.createElement('div');
  header.className = 'node-header';
  header.style.paddingLeft = `${depth * 16}px`;

  // 文件夹展开按钮
  if (node.children) {
    const toggleBtn = document.createElement('span');
    toggleBtn.className = 'toggle-btn collapsed';
    toggleBtn.textContent = '▶';
    toggleBtn.addEventListener('click', () => toggleChildren(item));
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

  // 组装节点
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

  // 复选框状态变化时更新子节点和父节点
  checkbox.addEventListener('change', () => {
    const checked = checkbox.checked;
    toggleChildCheckboxes(item, checked);
    updateParentCheckbox(item);
  });

  return item;
}

// 展开/收起子节点
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

// 全选/取消功能
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

// 递归勾选/取消子节点
function toggleChildCheckboxes(container, checked) {
  const childCheckboxes = container.querySelectorAll('.children-container .node-checkbox');
  childCheckboxes.forEach(cb => {
    cb.checked = checked;
    cb.indeterminate = false;
  });
}

// 更新父节点的勾选状态
function updateParentCheckbox(container) {
  const parentContainer = container.parentElement.closest('.bookmark-node');
  if (!parentContainer) return;

  const parentCheckbox = parentContainer.querySelector(':scope > .node-header > .node-checkbox');
  const childCheckboxes = container.parentElement.querySelectorAll(':scope > .bookmark-node > .node-header > .node-checkbox');

  const checkedCount = Array.from(childCheckboxes).filter(cb => cb.checked).length;
  const totalCount = childCheckboxes.length;

  if (checkedCount === totalCount) {
    parentCheckbox.checked = true;
    parentCheckbox.indeterminate = false;
  } else if (checkedCount === 0) {
    parentCheckbox.checked = false;
    parentCheckbox.indeterminate = false;
  } else {
    parentCheckbox.checked = false;
    parentCheckbox.indeterminate = true;
  }

  // 递归更新上层父节点
  updateParentCheckbox(parentContainer);
}

// 处理书签节点
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

// 导出选中的书签
// 保存当前勾选状态到localStorage
function saveCheckedOptions() {
  const checkedBoxes = document.querySelectorAll('.node-checkbox:checked');
  const indeterminateBoxes = document.querySelectorAll('.node-checkbox:indeterminate');

  const checkedIds = Array.from(checkedBoxes).map(cb => cb.dataset.id);
  const indeterminateIds = Array.from(indeterminateBoxes).map(cb => cb.dataset.id);

  const savedOptions = {
    checkedIds,
    indeterminateIds,
    timestamp: Date.now()
  };

  localStorage.setItem('bookmarksPortalOptions', JSON.stringify(savedOptions));
}

// 加载上次勾选状态
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
    const { checkedIds, indeterminateIds } = savedOptions;

    // 先重置所有复选框
    document.querySelectorAll('.node-checkbox').forEach(checkbox => {
      checkbox.checked = false;
      checkbox.indeterminate = false;
    });

    // 设置勾选状态
    checkedIds.forEach(id => {
      const checkbox = document.querySelector(`.node-checkbox[data-id="${id}"]`);
      if (checkbox) checkbox.checked = true;
    });

    // 设置部分选中状态
    indeterminateIds.forEach(id => {
      const checkbox = document.querySelector(`.node-checkbox[data-id="${id}"]`);
      if (checkbox) checkbox.indeterminate = true;
    });

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

    // 创建导出数据的基本结构
    const exportData = [{
      type: 'folder',
      addDate: Date.now(),
      title: translations[currentLang].bookmarksBar,
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

    // 优化的递归处理函数
    function processNode(node) {
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
          .map(child => processNode(child))
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

    // 批量处理书签栏的直接子节点
    exportData[0].children = bookmarkBar.children
      .filter(child => selectedIds.has(child.id) || indeterminateIds.has(child.id))
      .map(child => processNode(child))
      .filter(Boolean);

    // 导出为文件
    const jsonStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const localDate = new Date().toLocaleDateString('zh-CN', {  //导出时间从UTC时间转换为本地时间
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).replace(/\//g, '-'); // 将日期格式化为 YYYY-MM-DD
    a.download = `bookmarks⏰${localDate}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error exporting bookmarks:', error);
    alert(translations[currentLang].exportError);
  } finally {
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
    loadOptions: "加载上次选择"
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
    loadOptions: "Load Last Selection"
  }
};

let currentLang = navigator.language.startsWith('zh') ? 'zh' : 'en';

function applyLanguage() {
  // 使用缓存的DOM元素，避免重复查询
  domCache.title.textContent = translations[currentLang].title;
  domCache.selectAll.textContent = translations[currentLang].selectAll;
  domCache.deselectAll.textContent = translations[currentLang].deselectAll;
  domCache.exportButton.textContent = translations[currentLang].exportButton;
  domCache.loadOptionsButton.setAttribute('aria-label', translations[currentLang].loadOptions);
}
