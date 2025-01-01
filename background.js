class BackgroundController {
  // 私有屬性
  #timer = null;
  #currentTime = 0;
  #totalTime = 30 * 60; // 預設30分鐘
  #isRunning = false;
  #volume = 50;
  #metronomeInterval = null;
  #nextBeatTime = 0;
  #activeTabs = new Set();

  constructor() {
    this.#setupListeners();
  }

  // 設置所有監聽器
  #setupListeners() {
    // 標籤頁監聽
    chrome.tabs.onActivated.addListener(() => this.#updateActiveTab());
    chrome.tabs.onUpdated.addListener(this.#handleTabUpdate.bind(this));
    chrome.tabs.onRemoved.addListener(this.#handleTabRemove.bind(this));

    // 消息監聽
    chrome.runtime.onMessage.addListener(this.#handleMessage.bind(this));
  }

  // 更新活動標籤
  async #updateActiveTab() {
    const tabs = await chrome.tabs.query({active: true, currentWindow: true});
    if (tabs[0]) {
      await this.#syncStateToTab(tabs[0].id);
    }
  }

  // 處理標籤更新
  async #handleTabUpdate(tabId, changeInfo) {
    if (changeInfo.status === 'complete') {
      this.#activeTabs.add(tabId);
      if (this.#isRunning) {
        await this.#syncStateToTab(tabId);
      }
    }
  }

  // 處理標籤移除
  #handleTabRemove(tabId) {
    this.#activeTabs.delete(tabId);
  }

  // 同步狀態到指定標籤
  async #syncStateToTab(tabId) {
    try {
      await chrome.tabs.sendMessage(tabId, {
        action: 'syncState',
        isRunning: this.#isRunning,
        currentTime: this.#currentTime,
        volume: this.#volume
      });
    } catch (error) {
      // 忽略錯誤，標籤可能已關閉
      this.#activeTabs.delete(tabId);
    }
  }

  // 廣播消息到所有活動標籤
  async #broadcastMessage(message) {
    const promises = Array.from(this.#activeTabs).map(async (tabId) => {
      try {
        await chrome.tabs.sendMessage(tabId, message);
      } catch (error) {
        this.#activeTabs.delete(tabId);
      }
    });
    await Promise.allSettled(promises);
  }

  // 設置節拍器
  #setupMetronome() {
    // 清除現有的節拍器
    if (this.#metronomeInterval) {
      clearInterval(this.#metronomeInterval);
      this.#metronomeInterval = null;
    }

    // 計算 180BPM 的間隔（毫秒）
    const interval = Math.floor(60000 / 180); // 333.33ms
    this.#nextBeatTime = Date.now();

    // 播放聲音的函數
    const playBeat = () => {
      if (!this.#isRunning) return;

      const now = Date.now();
      if (now >= this.#nextBeatTime) {
        this.#broadcastMessage({
          action: 'playMetronome',
          volume: this.#volume
        });
        
        // 計算下一拍的時間
        while (this.#nextBeatTime <= now) {
          this.#nextBeatTime += interval;
        }
      }
    };

    // 使用較短的間隔來檢查，以提高精確度
    this.#metronomeInterval = setInterval(playBeat, 10);
    
    // 立即播放第一個音
    playBeat();

    // 每分鐘重新同步一次，防止時間漂移
    setInterval(() => {
      if (this.#isRunning) {
        this.#nextBeatTime = Date.now() + interval;
      }
    }, 60000);
  }

  // 開始計時
  #startTimer() {
    if (!this.#timer) {
      this.#updateActiveTab(); // 確保我們有最新的活動標籤
      this.#timer = setInterval(() => {
        this.#currentTime++;
        
        // 每5分鐘提示
        if (this.#currentTime % 300 === 0) {
          this.#broadcastMessage({
            action: 'showTimeNotification',
            time: this.#currentTime
          });
        }
        
        // 更新 popup
        chrome.runtime.sendMessage({
          action: 'updateTimer',
          time: this.#currentTime
        }).catch(() => {
          // 忽略 popup 關閉時的錯誤
        });
        
        // 檢查是否完成
        if (this.#currentTime >= this.#totalTime) {
          this.#stopTimer();
          this.#broadcastMessage({
            action: 'completed',
            time: this.#currentTime
          });
        }
      }, 1000);
    }
  }

  // 停止計時
  #stopTimer() {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
    if (this.#metronomeInterval) {
      clearInterval(this.#metronomeInterval);
      this.#metronomeInterval = null;
    }
    this.#isRunning = false;
    
    // 通知所有標籤頁停止
    this.#broadcastMessage({
      action: 'stop'
    });
  }

  // 處理接收到的消息
  #handleMessage(request, sender, sendResponse) {
    switch (request.action) {
      case 'getState':
        sendResponse({
          isRunning: this.#isRunning,
          currentTime: this.#currentTime,
          volume: this.#volume,
          totalTime: Math.floor(this.#totalTime / 60)
        });
        break;

      case 'start':
        if (!this.#isRunning) {
          this.#totalTime = request.totalTime * 60;
          this.#volume = request.volume;
          this.#isRunning = true;
          this.#nextBeatTime = Date.now();
          this.#setupMetronome();
          this.#startTimer();
          
          // 通知所有標籤頁開始
          this.#broadcastMessage({
            action: 'syncState',
            isRunning: true,
            currentTime: this.#currentTime,
            volume: this.#volume
          });
          
          sendResponse({ success: true });
        }
        break;
        
      case 'pause':
        this.#stopTimer();
        sendResponse({ success: true });
        break;
        
      case 'reset':
        this.#stopTimer();
        this.#currentTime = 0;
        sendResponse({ success: true });
        break;

      case 'updateVolume':
        this.#volume = request.volume;
        if (this.#isRunning) {
          this.#broadcastMessage({
            action: 'syncState',
            isRunning: true,
            currentTime: this.#currentTime,
            volume: this.#volume
          });
        }
        sendResponse({ success: true });
        break;
    }
    return true; // 保持消息通道開啟
  }
}

// 創建控制器實例
const backgroundController = new BackgroundController(); 