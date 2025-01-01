let timer = null;
let currentTime = 0;
let totalTime = 30 * 60; // 預設30分鐘
let isRunning = false;
let volume = 50;
let metronomeInterval = null;
let activeTabId = null;
let lastBeatTime = 0;
let nextBeatTime = 0;

// 追蹤所有開啟的標籤頁
let activeTabs = new Set();

// 更新活動標籤
function updateActiveTab() {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs[0]) {
      activeTabId = tabs[0].id;
    }
  });
}

// 初始化監聽器
chrome.tabs.onActivated.addListener(updateActiveTab);
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    // 將新標籤加入追蹤列表
    activeTabs.add(tabId);
    
    // 如果正在運行，向新標籤發送當前狀態
    if (isRunning) {
      chrome.tabs.sendMessage(tabId, {
        action: 'syncState',
        isRunning: isRunning,
        currentTime: currentTime,
        volume: volume
      }).catch(() => {
        // 忽略錯誤
      });
    }
  }
});

// 監聽標籤關閉
chrome.tabs.onRemoved.addListener((tabId) => {
  activeTabs.delete(tabId);
});

// 安全地發送消息到所有標籤
function broadcastMessage(message) {
  activeTabs.forEach(tabId => {
    chrome.tabs.sendMessage(tabId, message).catch(() => {
      // 如果發送失敗，從列表中移除該標籤
      activeTabs.delete(tabId);
    });
  });
}

// 180BPM 節拍器
function setupMetronome() {
  // 清除現有的節拍器
  if (metronomeInterval) {
    clearInterval(metronomeInterval);
    metronomeInterval = null;
  }

  // 計算 180BPM 的間隔（毫秒）
  const interval = Math.floor(60000 / 180); // 333.33ms
  nextBeatTime = Date.now();

  // 播放聲音的函數
  function playBeat() {
    if (!isRunning) return;

    const now = Date.now();
    if (now >= nextBeatTime) {
      broadcastMessage({
        action: 'playMetronome',
        volume: volume
      });
      
      // 計算下一拍的時間
      while (nextBeatTime <= now) {
        nextBeatTime += interval;
      }
    }
  }

  // 使用較短的間隔來檢查，以提高精確度
  metronomeInterval = setInterval(playBeat, 10);
  
  // 立即播放第一個音
  playBeat();

  // 每分鐘重新同步一次，防止時間漂移
  setInterval(() => {
    if (isRunning) {
      nextBeatTime = Date.now() + interval;
    }
  }, 60000);
}

// 開始計時
function startTimer() {
  if (!timer) {
    updateActiveTab(); // 確保我們有最新的活動標籤
    timer = setInterval(() => {
      currentTime++;
      
      // 每5分鐘提示
      if (currentTime % 300 === 0) {
        broadcastMessage({
          action: 'showTimeNotification',
          time: currentTime
        });
      }
      
      // 更新 popup
      chrome.runtime.sendMessage({
        action: 'updateTimer',
        time: currentTime
      }).catch(() => {
        // 忽略 popup 關閉時的錯誤
      });
      
      // 檢查是否完成
      if (currentTime >= totalTime) {
        stopTimer();
        broadcastMessage({
          action: 'completed',
          time: currentTime
        });
      }
    }, 1000);
  }
}

// 停止計時
function stopTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (metronomeInterval) {
    clearInterval(metronomeInterval);
    metronomeInterval = null;
  }
  isRunning = false;
  
  // 通知所有標籤頁停止
  broadcastMessage({
    action: 'stop'
  });
}

// 監聽來自 popup 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'getState':
      sendResponse({
        isRunning,
        currentTime,
        volume,
        totalTime: Math.floor(totalTime / 60)
      });
      break;

    case 'start':
      if (!isRunning) {
        totalTime = request.totalTime * 60;
        volume = request.volume;
        isRunning = true;
        nextBeatTime = Date.now();
        setupMetronome();
        startTimer();
        
        // 通知所有標籤頁開始
        broadcastMessage({
          action: 'syncState',
          isRunning: true,
          currentTime: currentTime,
          volume: volume
        });
        
        sendResponse({ success: true });
      }
      break;
      
    case 'pause':
      stopTimer();
      sendResponse({ success: true });
      break;
      
    case 'reset':
      stopTimer();
      currentTime = 0;
      sendResponse({ success: true });
      break;

    case 'updateVolume':
      volume = request.volume;
      if (isRunning) {
        // 音量變更不需要重新設置節拍器
        broadcastMessage({
          action: 'syncState',
          isRunning: true,
          currentTime: currentTime,
          volume: volume
        });
      }
      sendResponse({ success: true });
      break;
  }
  return true; // 保持消息通道開啟
}); 