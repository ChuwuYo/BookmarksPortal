document.addEventListener('DOMContentLoaded', () => {
  const bookmarkList = document.getElementById('bookmarkList');
  const selectAllBtn = document.getElementById('selectAll');
  const deselectAllBtn = document.getElementById('deselectAll');
  const exportButton = document.getElementById('exportButton');

  // 获取书签树
  chrome.bookmarks.getTree(async (bookmarkTreeNodes) => {
    // 获取书签栏（第一个根节点的第一个子节点）
    const bookmarkBar = bookmarkTreeNodes[0].children[0];
    displayBookmarks(bookmarkBar);
  });

  // 全选按钮
  selectAllBtn.addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('.folder-checkbox');
    checkboxes.forEach(checkbox => checkbox.checked = true);
  });

  // 取消全选按钮
  deselectAllBtn.addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('.folder-checkbox');
    checkboxes.forEach(checkbox => checkbox.checked = false);
  });

  // 导出按钮
  exportButton.addEventListener('click', exportSelectedBookmarks);
});

// 显示一级文件夹
function displayBookmarks(bookmarkBar) {
  const bookmarkList = document.getElementById('bookmarkList');
  
  bookmarkBar.children.forEach(node => {
    if (node.children) { // 只显示文件夹
      const folderDiv = document.createElement('div');
      folderDiv.className = 'folder-item';
      
      const folderNameDiv = document.createElement('div');
      folderNameDiv.className = 'folder-name';
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'folder-checkbox checkbox';
      checkbox.dataset.folderId = node.id;
      checkbox.dataset.folderTitle = node.title;
      checkbox.dataset.folderDate = node.dateAdded;
      
      const folderIcon = document.createElement('span');
      folderIcon.className = 'folder-icon';
      
      const nameSpan = document.createElement('span');
      nameSpan.textContent = node.title;
      
      folderNameDiv.appendChild(checkbox);
      folderNameDiv.appendChild(folderIcon);
      folderNameDiv.appendChild(nameSpan);
      folderDiv.appendChild(folderNameDiv);
      
      bookmarkList.appendChild(folderDiv);
    }
  });
}

// 处理书签节点
async function processBookmarkNode(node) {
  if (node.url) {
    const hostname = new URL(node.url).hostname;
    return {
      type: 'link',
      addDate: node.dateAdded,
      title: node.title,
      url: node.url,
      icon: `https://logo.clearbit.com/${hostname}`
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
  const selectedFolders = document.querySelectorAll('.folder-checkbox:checked');
  if (selectedFolders.length === 0) {
    alert('请至少选择一个文件夹！');
    return;
  }

  // 获取书签栏信息
  const bookmarkBar = {
    type: 'folder',
    title: '书签栏',
    addDate: Date.now(),
    children: []
  };

  // 获取选中文件夹的完整信息
  let processedCount = 0;
  const totalFolders = selectedFolders.length;

  for (const checkbox of selectedFolders) {
    const folderId = checkbox.dataset.folderId;
    
    chrome.bookmarks.getSubTree(folderId, async (results) => {
      try {
        const folderData = await processBookmarkNode(results[0]);
        bookmarkBar.children.push(folderData);
        processedCount++;

        if (processedCount === totalFolders) {
          const exportData = [bookmarkBar];
          const jsonStr = JSON.stringify(exportData, null, 2);
          
          const blob = new Blob([jsonStr], {
            type: 'application/json'
          });
          
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `bookmarks-export-${new Date().toISOString().split('T')[0]}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      } catch (error) {
        console.error('Error processing bookmark:', error);
      }
    });
  }
}