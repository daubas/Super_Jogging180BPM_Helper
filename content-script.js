// 創建一個全局對象來存儲 chrome API
window.chromeAPI = {
  runtime: chrome.runtime,
  storage: chrome.storage
};

// 等待 DOM 加載完成
document.addEventListener('DOMContentLoaded', () => {
  // 動態創建腳本元素
  const script = document.createElement('script');
  script.type = 'module';
  script.src = chrome.runtime.getURL('controller.js');

  // 監聽腳本加載完成
  script.onload = () => {
    script.remove(); // 移除腳本元素
  };

  // 添加到頁面
  (document.head || document.documentElement).appendChild(script);
});

// 設置全局錯誤處理
window.addEventListener('error', (event) => {
  console.error('內容腳本錯誤:', event.error);
});

// 轉發消息到頁面腳本
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  window.postMessage({
    type: 'FROM_EXTENSION',
    message: message
  }, '*');
  return true;
});

// 監聽來自頁面腳本的消息
window.addEventListener('message', (event) => {
  if (event.data.type === 'TO_EXTENSION') {
    chrome.runtime.sendMessage(event.data.message, (response) => {
      window.postMessage({
        type: 'EXTENSION_RESPONSE',
        message: response
      }, '*');
    });
  }
}); 