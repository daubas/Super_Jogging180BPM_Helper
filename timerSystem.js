class TimerSystem {
  // 私有屬性
  #isRunning = false;
  #isPaused = false;
  #isCountingDown = false;
  #currentTime = 0;
  #targetTime = 0;
  #intervalId = null;
  #callbacks = {
    onTick: null,
    onComplete: null,
    onStateChange: null
  };

  constructor(callbacks = {}) {
    this.#callbacks = { ...this.#callbacks, ...callbacks };
  }

  // 獲取當前狀態
  get state() {
    return {
      isRunning: this.#isRunning,
      isPaused: this.#isPaused,
      isCountingDown: this.#isCountingDown,
      currentTime: this.#currentTime,
      targetTime: this.#targetTime
    };
  }

  // 開始計時
  start(targetMinutes) {
    if (this.#isRunning && !this.#isPaused) return;

    this.#targetTime = targetMinutes * 60;
    this.#isRunning = true;
    this.#isPaused = false;
    
    this.#startTicking();
    this.#notifyStateChange();
  }

  // 暫停計時
  pause() {
    if (!this.#isRunning || this.#isPaused) return;

    this.#isPaused = true;
    this.#stopTicking();
    this.#notifyStateChange();
  }

  // 恢復計時
  resume() {
    if (!this.#isRunning || !this.#isPaused) return;

    this.#isPaused = false;
    this.#startTicking();
    this.#notifyStateChange();
  }

  // 停止計時
  stop() {
    if (!this.#isRunning) return;

    this.#isRunning = false;
    this.#isPaused = false;
    this.#currentTime = 0;
    this.#stopTicking();
    this.#notifyStateChange();
  }

  // 開始倒數
  startCountdown() {
    if (this.#isCountingDown) return;
    this.#isCountingDown = true;
    this.#notifyStateChange();
  }

  // 結束倒數
  endCountdown() {
    if (!this.#isCountingDown) return;
    this.#isCountingDown = false;
    this.#notifyStateChange();
  }

  // 開始計時器
  #startTicking() {
    if (this.#intervalId) return;

    this.#intervalId = setInterval(() => {
      if (this.#isCountingDown) return;

      this.#currentTime++;
      
      if (this.#callbacks.onTick) {
        this.#callbacks.onTick(this.#currentTime);
      }

      if (this.#currentTime >= this.#targetTime) {
        this.#handleCompletion();
      }
    }, 1000);
  }

  // 停止計時器
  #stopTicking() {
    if (this.#intervalId) {
      clearInterval(this.#intervalId);
      this.#intervalId = null;
    }
  }

  // 處理完成
  #handleCompletion() {
    this.stop();
    if (this.#callbacks.onComplete) {
      this.#callbacks.onComplete(this.#currentTime);
    }
  }

  // 通知狀態改變
  #notifyStateChange() {
    if (this.#callbacks.onStateChange) {
      this.#callbacks.onStateChange(this.state);
    }
  }

  // 清理資源
  cleanup() {
    this.stop();
    this.#callbacks = {
      onTick: null,
      onComplete: null,
      onStateChange: null
    };
  }
}

// 導出類
export default TimerSystem; 