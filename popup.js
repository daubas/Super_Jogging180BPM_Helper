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

  // 確保音訊系統已初始化
  async function ensureAudioReady() {
    return new Promise((resolve) => {
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (!tabs[0]) {
          alert('請先打開一個網頁再開始');
          resolve(false);
          return;
        }

        if (tabs[0].url.startsWith('chrome://') || tabs[0].url.startsWith('chrome-extension://')) {
          alert('請在一般網頁上開始（不能在 Chrome 內部頁面上運行）');
          resolve(false);
          return;
        }

        // 發送測試音效
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'test',
          volume: 0 // 音量設為0，用戶聽不到
        }).then(() => {
          resolve(true);
        }).catch((error) => {
          if (error.message.includes('Could not establish connection')) {
            // 如果連接失敗，嘗試重新注入 content script
            chrome.scripting.executeScript({
              target: { tabId: tabs[0].id },
              files: ['content.js']
            }).then(() => {
              setTimeout(() => {
                chrome.tabs.sendMessage(tabs[0].id, {
                  action: 'test',
                  volume: 0
                }).then(() => resolve(true));
              }, 100);
            }).catch(() => {
              alert('無法在當前頁面運行，請嘗試重新載入頁面或在其他網頁上開始');
              resolve(false);
            });
          } else {
            alert('初始化失敗，請嘗試重新載入頁面');
            resolve(false);
          }
        });
      });
    });
  }

  // 開始按鈕
  startBtn.addEventListener('click', async () => {
    // 先確保音訊系統已準備就緒
    const isReady = await ensureAudioReady();
    if (!isReady) return;

    const message = {
      action: 'start',
      totalTime: parseInt(totalTimeInput.value),
      volume: parseInt(volumeInput.value)
    };
    chrome.runtime.sendMessage(message, (response) => {
      if (response && response.success) {
        isRunning = true;
        updateButtonStates(true);
      }
    });
  });

  // 暫停按鈕
  pauseBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'pause' }, (response) => {
      if (response && response.success) {
        isRunning = false;
        updateButtonStates(false);
      }
    });
  });

  // 重置按鈕
  resetBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'reset' }, (response) => {
      if (response && response.success) {
        isRunning = false;
        updateButtonStates(false);
        updateDisplay(0);
      }
    });
  });

  // 測試按鈕
  testBtn.addEventListener('click', () => {
    // 先獲取當前活動標籤
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (!tabs[0]) {
        alert('請先打開一個網頁再進行測試');
        return;
      }

      // 檢查是否是 Chrome 內部頁面
      if (tabs[0].url.startsWith('chrome://') || tabs[0].url.startsWith('chrome-extension://')) {
        alert('請在一般網頁上進行測試（不能在 Chrome 內部頁面上測試）');
        return;
      }

      // 發送測試消息
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'test',
        volume: parseInt(volumeInput.value)
      }).catch((error) => {
        if (error.message.includes('Could not establish connection')) {
          // 如果連接失敗，嘗試重新注入 content script
          chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            files: ['content.js']
          }).then(() => {
            // 重新嘗試發送消息
            setTimeout(() => {
              chrome.tabs.sendMessage(tabs[0].id, {
                action: 'test',
                volume: parseInt(volumeInput.value)
              });
            }, 100);
          }).catch((error) => {
            alert('無法在當前頁面執行測試，請嘗試重新載入頁面或在其他網頁上測試');
            console.error('腳本注入失敗:', error);
          });
        } else {
          alert('測試失敗，請嘗試重新載入頁面');
          console.error('測試消息發送失敗:', error);
        }
      });
    });
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

  volumeInput.addEventListener('change', () => {
    chrome.storage.local.set({ volume: volumeInput.value });
    if (isRunning) {
      chrome.runtime.sendMessage({
        action: 'updateVolume',
        volume: parseInt(volumeInput.value)
      });
    }
  });
}); 