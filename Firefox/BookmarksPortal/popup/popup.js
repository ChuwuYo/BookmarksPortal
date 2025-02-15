document.addEventListener('DOMContentLoaded', () => {
  const bookmarkList = document.getElementById('bookmarkList');
  const selectAllBtn = document.getElementById('selectAllBtn');
  const deselectAllBtn = document.getElementById('deselectAllBtn');
  const exportButton = document.getElementById('exportButton');
  const loading = document.getElementById('loading');
  const container = document.getElementById('container');
  const errorMessage = document.getElementById('error');

  // █ 初始化书签树
  async function initialize() {
      try {
          const bookmarkTree = await browser.bookmarks.getTree();
          const bookmarkBar = bookmarkTree[0].children[0];
          displayBookmarks(bookmarkBar);
          container.hidden = false;
      } catch (err) {
          errorMessage.hidden = false;
          console.error('初始化失败:', err);
      } finally {
          loading.hidden = true;
          exportButton.disabled = false;
      }
  }

  // █ 渲染书签列表
  function displayBookmarks(bookmarkNode, depth = 0) {
      if (!bookmarkNode.children) return;

      const fragment = document.createDocumentFragment();
      
      bookmarkNode.children.forEach(node => {
          if (!node.children) return;

          const li = document.createElement('li');
          li.className = 'bookmark-item';
          li.innerHTML = `
              <input type="checkbox" 
                     class="folder-checkbox"
                     data-folder-id="${node.id}"
                     style="margin-left: ${depth * 15}px">
              <span>📁 ${node.title || '未命名文件夹'}</span>
          `;
          fragment.appendChild(li);
      });

      bookmarkList.appendChild(fragment);
  }

  // █ 全选/反选处理
  function toggleAll(select = true) {
      const checkboxes = document.querySelectorAll('.folder-checkbox');
      checkboxes.forEach(checkbox => checkbox.checked = select);
  }

  // █ 导出按钮点击处理器
  async function handleExport() {
      const checkboxes = document.querySelectorAll('.folder-checkbox:checked');
      
      if (checkboxes.length === 0) {
          alert('请至少选择一个文件夹！');
          return;
      }

      exportButton.disabled = true;
      const spinner = exportButton.querySelector('.spinner');
      const buttonText = exportButton.querySelector('.button-text');
      spinner.hidden = false;
      buttonText.textContent = '导出中...';

      try {
          const processedData = await processSelectedFolders(checkboxes);
          triggerDownload(processedData);
      } catch (err) {
          alert('导出失败，请检查控制台');
          console.error('导出过程错误:', err);
      } finally {
          spinner.hidden = true;
          exportButton.disabled = false;
          buttonText.textContent = '导出选中书签';
      }
  }

  // 事件绑定
  selectAllBtn.addEventListener('click', () => toggleAll(true));
  deselectAllBtn.addEventListener('click', () => toggleAll(false));
  exportButton.addEventListener('click', handleExport);

  // 初始化
  initialize();
});

// █ 异步处理选定文件夹
async function processSelectedFolders(checkboxes) {
  const processPromises = Array.from(checkboxes).map(checkbox => {
      const folderId = checkbox.dataset.folderId;
      return browser.bookmarks.getSubTree(folderId)
          .then(results => processBookmarkNode(results[0]));
  });

  return {
      type: 'folder',
      title: document.title,
      children: await Promise.all(processPromises),
      addDate: Date.now()
  };
}

// █ 递归处理书签节点
async function processBookmarkNode(node) {
  if (node.url) {
      const hostname = getValidHostname(node.url);
      return {
          type: 'url',
          title: node.title || '未命名书签',
          url: node.url,
          icon: hostname ? `https://logo.clearbit.com/${hostname}` : '',
          addDate: node.dateAdded
      };
  }

  if (node.children) {
      const children = await Promise.all(node.children.map(processBookmarkNode));
      return {
          type: 'folder',
          title: node.title || '未命名文件夹',
          children: children.filter(Boolean),
          addDate: node.dateAdded
      };
  }
}

// █ 生成下载文件
function triggerDownload(data) {
  const jsonStr = JSON.stringify([data], null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `firefox-bookmarks-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// █ 校验有效域名
function getValidHostname(url) {
  try {
      const hostname = new URL(url).hostname;
      return /^[\w-]+(\.[\w-]+)+$/.test(hostname) ? hostname : null;
  } catch (err) {
      return null;
  }
}
