document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('startBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const resetBtn = document.getElementById('resetBtn');
  const testBtn = document.getElementById('testBtn');
  const timerDisplay = document.querySelector('.timer');
  const totalTimeInput = document.getElementById('totalTime');
  const volumeInput = document.getElementById('volume');
  const volumeValue = document.querySelector('.volume-value');

  let isRunning = false;
  let currentTab = null;

  // 檢查當前運行狀態
  chrome.runtime.sendMessage({ action: 'getState' }, (response) => {
    if (response) {
      isRunning = response.isRunning;
      updateButtonStates(isRunning);
      if (response.currentTime !== undefined) {
        updateDisplay(response.currentTime);
      }
    }
  });

  // 載入設定
  chrome.storage.local.get(['totalTime', 'volume'], (result) => {
    if (result.totalTime) totalTimeInput.value = result.totalTime;
    if (result.volume) {
      volumeInput.value = result.volume;
      volumeValue.textContent = `${result.volume}%`;
    }
  });

  // 更新顯示時間
  function updateDisplay(time) {
    const minutes = Math.floor(time / 60);
    const seconds = time % 60;
    timerDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  // 更新按鈕狀態
  function updateButtonStates(running) {
    startBtn.disabled = running;
    pauseBtn.disabled = !running;
    resetBtn.disabled = false;
    testBtn.disabled = running;
  }

  // 獲取當前標籤
  async function getCurrentTab() {
    if (currentTab) {
      try {
        // 檢查標籤是否還存在
        await chrome.tabs.get(currentTab.id);
        return currentTab;
      } catch (e) {
        currentTab = null;
      }
    }

    const tabs = await chrome.tabs.query({active: true, currentWindow: true});
    if (tabs[0]) {
      currentTab = tabs[0];
      return currentTab;
    }
    return null;
  }

  // 初始化音訊系統
  async function initAudioSystem() {
    const tab = await getCurrentTab();
    if (!tab) {
      throw new Error('找不到可用的標籤頁');
    }

    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      throw new Error('無法在 Chrome 內部頁面上運行');
    }

    try {
      // 嘗試初始化音訊系統
      await chrome.tabs.sendMessage(tab.id, {
        action: 'initAudio'
      });
      return true;
    } catch (error) {
      if (error.message.includes('Could not establish connection')) {
        // 注入 content script
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        
        // 等待腳本加載
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // 重試初始化
        await chrome.tabs.sendMessage(tab.id, {
          action: 'initAudio'
        });
        return true;
      }
      throw error;
    }
  }

  // 開始按鈕
  startBtn.addEventListener('click', async () => {
    try {
      // 初始化音訊系統
      await initAudioSystem();
      
      const tab = await getCurrentTab();
      if (!tab) return;

      // 發送開始消息到當前標籤
      await chrome.tabs.sendMessage(tab.id, {
        action: 'playMetronome',
        volume: parseInt(volumeInput.value)
      });

      // 發送到 background
      chrome.runtime.sendMessage({
        action: 'start',
        totalTime: parseInt(totalTimeInput.value),
        volume: parseInt(volumeInput.value)
      }, (response) => {
        if (response && response.success) {
          isRunning = true;
          updateButtonStates(true);
        }
      });
    } catch (error) {
      console.error('啟動失敗:', error);
      alert(error.message || '啟動失敗，請重試');
    }
  });

  // 暫停按鈕
  pauseBtn.addEventListener('click', async () => {
    try {
      const tab = await getCurrentTab();
      if (tab) {
        await chrome.tabs.sendMessage(tab.id, { action: 'stop' });
      }

      chrome.runtime.sendMessage({ action: 'pause' }, (response) => {
        if (response && response.success) {
          isRunning = false;
          updateButtonStates(false);
        }
      });
    } catch (error) {
      console.error('暫停失敗:', error);
    }
  });

  // 重置按鈕
  resetBtn.addEventListener('click', async () => {
    try {
      const tab = await getCurrentTab();
      if (tab) {
        await chrome.tabs.sendMessage(tab.id, { action: 'stop' });
      }

      chrome.runtime.sendMessage({ action: 'reset' }, (response) => {
        if (response && response.success) {
          isRunning = false;
          updateButtonStates(false);
          updateDisplay(0);
        }
      });
    } catch (error) {
      console.error('重置失敗:', error);
    }
  });

  // 測試按鈕
  testBtn.addEventListener('click', async () => {
    try {
      await initAudioSystem();
      
      const tab = await getCurrentTab();
      if (!tab) return;

      await chrome.tabs.sendMessage(tab.id, {
        action: 'test',
        volume: parseInt(volumeInput.value)
      });
    } catch (error) {
      console.error('測試失敗:', error);
      alert(error.message || '測試失敗，請重試');
    }
  });

  // 監聽來自 background 的更新
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'updateTimer') {
      updateDisplay(request.time);
      if (!isRunning) {
        isRunning = true;
        updateButtonStates(true);
      }
    }
  });

  // 音量變更
  volumeInput.addEventListener('input', () => {
    volumeValue.textContent = `${volumeInput.value}%`;
  });

  // 儲存設定
  totalTimeInput.addEventListener('change', () => {
    const value = parseInt(totalTimeInput.value);
    if (value < 1) totalTimeInput.value = 1;
    if (value > 180) totalTimeInput.value = 180;
    chrome.storage.local.set({ totalTime: totalTimeInput.value });
  });

  volumeInput.addEventListener('change', async () => {
    chrome.storage.local.set({ volume: volumeInput.value });
    if (isRunning) {
      try {
        const tab = await getCurrentTab();
        if (tab) {
          await chrome.tabs.sendMessage(tab.id, {
            action: 'updateVolume',
            volume: parseInt(volumeInput.value)
          });
        }
      } catch (error) {
        console.error('音量更新失敗:', error);
      }
    }
  });
}); 