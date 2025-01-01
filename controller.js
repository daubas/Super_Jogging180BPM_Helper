import AudioSystem from './audioSystem.js';
import VisualSystem from './visualSystem.js';
import TimerSystem from './timerSystem.js';

class Controller {
  // 私有屬性
  #audioSystem = null;
  #visualSystem = null;
  #timerSystem = null;
  #volume = 50;
  #isCountingDown = false;
  #messageQueue = [];
  #isProcessingMessage = false;
  #isPlaying = false;
  #initializationPromise = null;

  constructor() {
    this.#initialize();
  }

  // 初始化
  async #initialize() {
    try {
      // 等待 DOM 完全加載
      if (document.readyState !== 'complete') {
        await new Promise(resolve => window.addEventListener('load', resolve, { once: true }));
      }

      await this.#initializeSystems();
      this.#setupMessageListener();
      this.#setupCleanup();
    } catch (error) {
      console.error('初始化失敗:', error);
    }
  }

  // 初始化所有系統
  async #initializeSystems() {
    if (this.#initializationPromise) {
      return this.#initializationPromise;
    }

    this.#initializationPromise = (async () => {
      try {
        // 創建視覺系統
        this.#visualSystem = new VisualSystem();

        // 創建音訊系統，並設置節拍回調
        this.#audioSystem = new AudioSystem((isHighPitch) => {
          if (!this.#isCountingDown && this.#isPlaying) {
            this.#visualSystem.visualizeBeat(isHighPitch);
          }
        });

        // 創建計時系統，並設置回調
        this.#timerSystem = new TimerSystem({
          onTick: (time) => this.#handleTick(time),
          onComplete: (time) => this.#handleComplete(time),
          onStateChange: (state) => this.#handleStateChange(state)
        });

        // 初始化音訊系統
        await this.#audioSystem.initialize();
      } catch (error) {
        console.error('系統初始化失敗:', error);
        throw error;
      }
    })();

    try {
      await this.#initializationPromise;
    } finally {
      this.#initializationPromise = null;
    }
  }

  // 設置清理
  #setupCleanup() {
    window.addEventListener('unload', () => this.cleanup());
    window.addEventListener('beforeunload', () => this.cleanup());
    window.addEventListener('pagehide', () => this.cleanup());
  }

  // 設置消息監聽
  #setupMessageListener() {
    window.addEventListener('message', async (event) => {
      if (event.data.type === 'FROM_EXTENSION') {
        await this.#handleMessage(event.data.message);
      }
    });
  }

  // 發送消息到擴展
  async #sendMessageToExtension(message) {
    return new Promise((resolve) => {
      window.postMessage({
        type: 'TO_EXTENSION',
        message: message
      }, '*');

      const listener = (event) => {
        if (event.data.type === 'EXTENSION_RESPONSE') {
          window.removeEventListener('message', listener);
          resolve(event.data.message);
        }
      };

      window.addEventListener('message', listener);
    });
  }

  // 處理消息
  async #handleMessage(request) {
    // 將消息添加到隊列
    this.#messageQueue.push(request);
    
    // 如果沒有正在處理的消息，開始處理
    if (!this.#isProcessingMessage) {
      await this.#processMessageQueue();
    }
  }

  // 處理消息隊列
  async #processMessageQueue() {
    if (this.#isProcessingMessage || this.#messageQueue.length === 0) {
      return;
    }

    this.#isProcessingMessage = true;

    try {
      while (this.#messageQueue.length > 0) {
        const request = this.#messageQueue.shift();
        await this.#processMessage(request);
      }
    } finally {
      this.#isProcessingMessage = false;
    }
  }

  // 處理單個消息
  async #processMessage(request) {
    try {
      switch (request.action) {
        case 'initAudio':
          await this.#handleInitAudio();
          break;

        case 'playMetronome':
          await this.#handlePlayMetronome(request.volume);
          break;

        case 'stop':
          await this.#handleStop();
          break;

        case 'test':
          await this.#handleTest(request.volume);
          break;

        case 'updateVolume':
          await this.#handleUpdateVolume(request.volume);
          break;

        case 'syncState':
          await this.#handleSyncState(request);
          break;
      }
    } catch (error) {
      console.error('消息處理失敗:', error);
      await this.#handleStop();
    }
  }

  // 處理初始化音訊請求
  async #handleInitAudio() {
    try {
      // 確保先停止任何現有的播放
      await this.#audioSystem?.stop();
      const success = await this.#audioSystem?.initialize();
      await this.#sendMessageToExtension(success);
    } catch (error) {
      console.error('音訊初始化失敗:', error);
      await this.#sendMessageToExtension(false);
    }
  }

  // 處理開始播放請求
  async #handlePlayMetronome(volume) {
    try {
      // 如果已經在播放，先停止
      if (this.#isPlaying) {
        await this.#handleStop();
        // 等待一段時間確保完全停止
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      this.#volume = volume;
      
      // 開始倒數前先確保音訊系統處於停止狀態
      this.#isPlaying = false;
      this.#isCountingDown = true;
      await this.#audioSystem?.stop();
      await this.#audioSystem?.initialize();
      
      // 開始倒數
      this.#timerSystem.startCountdown();
      await this.#visualSystem.countdown(3);
      
      // 結束倒數，等待一小段時間確保完全結束
      this.#isCountingDown = false;
      this.#timerSystem.endCountdown();
      await new Promise(resolve => setTimeout(resolve, 100));

      // 重新初始化音訊系統
      await this.#audioSystem?.initialize();
      
      // 開始播放和計時
      this.#isPlaying = true;
      await this.#audioSystem?.start(volume / 100);
      this.#visualSystem.setVisualizerActive(true);
      this.#timerSystem.start(30); // 30分鐘
    } catch (error) {
      console.error('播放啟動失敗:', error);
      await this.#handleStop();
    }
  }

  // 處理停止請求
  async #handleStop() {
    try {
      // 先更新狀態
      this.#isCountingDown = false;
      this.#isPlaying = false;
      
      // 停止音訊
      if (this.#audioSystem) {
        await this.#audioSystem.stop();
        // 等待一小段時間確保完全停止
        await new Promise(resolve => setTimeout(resolve, 100));
        // 重新初始化以確保清理
        await this.#audioSystem.initialize();
      }
      
      // 停止視覺效果
      if (this.#visualSystem) {
        this.#visualSystem.setVisualizerActive(false);
      }
      
      // 停止計時
      if (this.#timerSystem) {
        this.#timerSystem.stop();
      }

      // 清空消息隊列
      this.#messageQueue = [];
      this.#isProcessingMessage = false;
    } catch (error) {
      console.error('停止失敗:', error);
      // 在錯誤情況下，強制重置所有狀態
      this.#forceReset();
    }
  }

  // 強制重置所有狀態
  async #forceReset() {
    this.#isCountingDown = false;
    this.#isPlaying = false;
    this.#messageQueue = [];
    this.#isProcessingMessage = false;
    
    try {
      // 重新創建音訊系統
      if (this.#audioSystem) {
        this.#audioSystem.cleanup();
        this.#audioSystem = new AudioSystem((isHighPitch) => {
          if (!this.#isCountingDown && this.#isPlaying) {
            this.#visualSystem?.visualizeBeat(isHighPitch);
          }
        });
        await this.#audioSystem.initialize();
      }
    } catch (error) {
      console.error('強制重置失敗:', error);
    }
  }

  // 處理測試請求
  async #handleTest(volume) {
    try {
      // 如果已經在播放，先停止
      if (this.#isPlaying) {
        await this.#handleStop();
        // 等待一段時間確保完全停止
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const testVolume = volume || 50;
      await this.#visualSystem.showNotification('測試模式');
      
      // 開始倒數前先確保音訊系統處於停止狀態
      this.#isPlaying = false;
      this.#isCountingDown = true;
      await this.#audioSystem?.stop();
      await this.#audioSystem?.initialize();
      
      // 開始倒數
      this.#timerSystem.startCountdown();
      await this.#visualSystem.countdown(3);
      
      // 結束倒數，等待一小段時間確保完全結束
      this.#isCountingDown = false;
      this.#timerSystem.endCountdown();
      await new Promise(resolve => setTimeout(resolve, 100));

      // 重新初始化音訊系統
      await this.#audioSystem?.initialize();
      
      // 播放測試音訊
      this.#isPlaying = true;
      await this.#audioSystem?.start(testVolume / 100);
      this.#visualSystem.setVisualizerActive(true);

      // 4秒後停止
      setTimeout(async () => {
        await this.#handleStop();
        await this.#visualSystem.showNotification('測試完成');
      }, 4000);
    } catch (error) {
      console.error('測試失敗:', error);
      await this.#handleStop();
    }
  }

  // 處理音量更新
  async #handleUpdateVolume(volume) {
    try {
      this.#volume = volume;
      await this.#audioSystem?.setVolume(volume / 100);
    } catch (error) {
      console.error('音量更新失敗:', error);
    }
  }

  // 處理狀態同步
  async #handleSyncState(request) {
    try {
      if (request.isRunning && !this.#isCountingDown) {
        this.#isPlaying = true;
        await this.#audioSystem?.start(this.#volume / 100);
        this.#visualSystem.setVisualizerActive(true);
        this.#timerSystem.resume();
      } else {
        await this.#handleStop();
      }
    } catch (error) {
      console.error('狀態同步失敗:', error);
      await this.#handleStop();
    }
  }

  // 處理計時器滴答
  async #handleTick(time) {
    if (!this.#isCountingDown) {
      await this.#visualSystem.showTimeNotification(time);
    }
  }

  // 處理計時完成
  async #handleComplete(time) {
    await this.#handleStop();
    await this.#visualSystem.showCompletionNotification(time);
  }

  // 處理狀態改變
  #handleStateChange(state) {
    // 可以在這裡添加額外的狀態處理邏輯
  }

  // 清理資源
  async cleanup() {
    try {
      await this.#handleStop();
      this.#audioSystem?.cleanup();
      this.#visualSystem?.cleanup();
      this.#timerSystem?.cleanup();
      this.#messageQueue = [];
      this.#isProcessingMessage = false;
      this.#initializationPromise = null;
    } catch (error) {
      console.error('清理失敗:', error);
    }
  }
}

// 創建控制器實例
const controller = new Controller();

// 處理頁面卸載
window.addEventListener('unload', () => {
  controller.cleanup();
}); 