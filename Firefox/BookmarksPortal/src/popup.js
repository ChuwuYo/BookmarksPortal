// 浏览器 API 兼容性处理
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

document.addEventListener('DOMContentLoaded', async () => {
  const title = document.getElementById('title');
  const selectAllBtn = document.getElementById('selectAll');
  const deselectAllBtn = document.getElementById('deselectAll');
  const exportButton = document.getElementById('exportButton');
  const languageToggle = document.getElementById('languageToggle');

  // 初始化语言
  applyLanguage();

  // 语言切换按钮事件
  languageToggle.addEventListener('click', () => {
    currentLang = currentLang === 'zh' ? 'en' : 'zh';
    applyLanguage();
  });

  // 获取并展示完整书签树
  try {
    const bookmarkTree = await browserAPI.bookmarks.getTree();
    const bookmarkBar = bookmarkTree[0].children[0];  // 书签栏节点
    renderBookmarkTree(bookmarkBar.children);
  } catch (error) {
    console.error('Error loading bookmarks:', error);
  }

  // 全选/取消逻辑
  selectAllBtn.addEventListener('click', () => toggleAllCheckboxes(true));
  deselectAllBtn.addEventListener('click', () => toggleAllCheckboxes(false));

  // 导出功能
  exportButton.addEventListener('click', exportSelectedBookmarks);
});

// 定义一个函数 renderBookmarkTree，用于渲染书签树
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
  document.querySelectorAll('.node-checkbox').forEach(checkbox => {
    checkbox.checked = checked;
    checkbox.indeterminate = false;
  });

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
      icon: hostname ? `https://logo.clearbit.com/${hostname}` : ''
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
async function exportSelectedBookmarks() {
  const selectedCheckboxes = document.querySelectorAll('.node-checkbox:checked');
  if (selectedCheckboxes.length === 0) {
    alert(currentLang === 'zh' ? '请至少选择一个项目！' : 'Please select at least one item!');
    return;
  }
  
  // 显示加载状态
  const exportButton = document.getElementById('exportButton');
  const originalText = exportButton.textContent;
  exportButton.disabled = true;
  exportButton.textContent = currentLang === 'zh' ? '导出中...' : 'Exporting...';
  
  try {
    const bookmarkTree = await browserAPI.bookmarks.getTree();
    const bookmarkBar = bookmarkTree[0].children[0];
  
    const exportData = [{
      type: 'folder',
      addDate: Date.now(),
      title: currentLang === 'zh' ? '书签栏' : 'Bookmarks Bar',
      children: []
    }];
  
    const selectedIds = new Set(Array.from(selectedCheckboxes).map(cb => cb.dataset.id));
  
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
        const processedChildren = node.children
          .filter(child => selectedIds.has(child.id))
          .map(child => processNode(child))
          .filter(Boolean);
  
        if (processedChildren.length > 0 || selectedIds.has(node.id)) {
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
      .filter(child => selectedIds.has(child.id))
      .map(child => processNode(child))
      .filter(Boolean);
  
    const jsonStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bookmarks-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error exporting bookmarks:', error);
    alert(currentLang === 'zh' ? 
      '导出过程中发生错误，请查看控制台了解详情。' : 
      'Error occurred during export, please check console for details.');
  } finally {
    // 恢复按钮状态
    exportButton.disabled = false;
    exportButton.textContent = originalText;
  }
}

const translations = {
  zh: {
    title: "选择要导出的书签",
    selectAll: "选中所有",
    deselectAll: "取消全选",
    exportButton: "导出书签"
  },
  en: {
    title: "Select Your Bookmarks",
    selectAll: "Select All",
    deselectAll: "Deselect All",
    exportButton: "Export"
  }
};

let currentLang = navigator.language.startsWith('zh') ? 'zh' : 'en';

function applyLanguage() {
  const title = document.getElementById('title');
  const selectAllBtn = document.getElementById('selectAll');
  const deselectAllBtn = document.getElementById('deselectAll');
  const exportButton = document.getElementById('exportButton');

  title.textContent = translations[currentLang].title;
  selectAllBtn.textContent = translations[currentLang].selectAll;
  deselectAllBtn.textContent = translations[currentLang].deselectAll;
  exportButton.textContent = translations[currentLang].exportButton;
}
