class VisualSystem {
  // 私有屬性
  #beatVisualizer = null;
  #isVisualizerActive = false;
  #overlayElements = new Map();

  // 視覺元素樣式
  static #STYLES = {
    beatVisualizer: `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 20px;
      height: 20px;
      background: rgba(76, 175, 80, 0.8);
      border-radius: 50%;
      z-index: 999999;
      display: none;
      transition: transform 0.1s, background-color 0.1s;
    `,
    countdownOverlay: `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      font-size: 48px;
      font-weight: bold;
      padding: 40px;
      border-radius: 50%;
      width: 100px;
      height: 100px;
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 999999;
      opacity: 0;
      transition: opacity 0.3s, transform 0.3s;
    `,
    notificationOverlay: `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      justify-content: center;
      align-items: center;
      opacity: 0;
      transition: opacity 1s ease-in-out;
      pointer-events: none;
      z-index: 999999;
    `,
    notificationContent: `
      background: rgba(255, 255, 255, 0.9);
      padding: 30px 50px;
      border-radius: 15px;
      box-shadow: 0 0 20px rgba(0, 0, 0, 0.3);
      text-align: center;
      font-family: 'Arial', sans-serif;
      transform: scale(0.9);
      transition: transform 1s ease-in-out;
    `
  };

  constructor() {
    this.#createBeatVisualizer();
  }

  // 創建節拍視覺化器
  #createBeatVisualizer() {
    this.#beatVisualizer = document.createElement('div');
    this.#beatVisualizer.id = 'beat-visualizer';
    this.#beatVisualizer.style.cssText = VisualSystem.#STYLES.beatVisualizer;
    document.body.appendChild(this.#beatVisualizer);
  }

  // 顯示/隱藏節拍視覺化器
  setVisualizerActive(active) {
    this.#isVisualizerActive = active;
    this.#beatVisualizer.style.display = active ? 'block' : 'none';
  }

  // 視覺化節拍
  visualizeBeat(isHighPitch = true) {
    if (!this.#isVisualizerActive) return;

    const color = isHighPitch ? 'rgba(76, 175, 80, 0.8)' : 'rgba(33, 150, 243, 0.8)';
    
    this.#beatVisualizer.style.transform = 'scale(1.2)';
    this.#beatVisualizer.style.backgroundColor = color;
    
    setTimeout(() => {
      if (this.#isVisualizerActive) {
        this.#beatVisualizer.style.transform = 'scale(1)';
      }
    }, 100);
  }

  // 倒數計時顯示
  async countdown(seconds) {
    const overlay = document.createElement('div');
    overlay.style.cssText = VisualSystem.#STYLES.countdownOverlay;
    document.body.appendChild(overlay);

    try {
      for (let i = seconds; i > 0; i--) {
        overlay.textContent = i;
        overlay.style.opacity = '1';
        overlay.style.transform = 'translate(-50%, -50%) scale(1)';
        
        await new Promise(resolve => setTimeout(resolve, 800));
        
        overlay.style.opacity = '0';
        overlay.style.transform = 'translate(-50%, -50%) scale(0.8)';
        
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      overlay.textContent = '開始';
      overlay.style.opacity = '1';
      overlay.style.transform = 'translate(-50%, -50%) scale(1.2)';
      
      await new Promise(resolve => setTimeout(resolve, 800));
      
      overlay.style.opacity = '0';
      overlay.style.transform = 'translate(-50%, -50%) scale(0.8)';
      
      await new Promise(resolve => setTimeout(resolve, 200));
    } finally {
      document.body.removeChild(overlay);
    }
  }

  // 顯示通知
  async showNotification(message, duration = 2000, isSuccess = false) {
    const overlay = document.createElement('div');
    overlay.style.cssText = VisualSystem.#STYLES.notificationOverlay;
    
    const content = document.createElement('div');
    content.style.cssText = VisualSystem.#STYLES.notificationContent;
    content.style.backgroundColor = isSuccess ? 'rgba(76, 175, 80, 0.9)' : 'rgba(255, 255, 255, 0.9)';
    content.style.color = isSuccess ? 'white' : 'black';
    content.innerHTML = `<h2 style="margin: 0; font-size: 24px;">${message}</h2>`;
    
    overlay.appendChild(content);
    document.body.appendChild(overlay);

    // 觸發動畫
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      content.style.transform = 'scale(1)';
    });

    // 設定消失時間
    await new Promise(resolve => setTimeout(resolve, duration));

    overlay.style.opacity = '0';
    content.style.transform = 'scale(0.9)';
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    document.body.removeChild(overlay);
  }

  // 顯示時間通知
  async showTimeNotification(time) {
    const minutes = Math.floor(time / 60);
    const seconds = time % 60;
    const timeString = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    await this.showNotification(`已跑 ${timeString}`);
  }

  // 顯示完成通知
  async showCompletionNotification(time) {
    const minutes = Math.floor(time / 60);
    const timeString = `${String(minutes).padStart(2, '0')}:${String(0).padStart(2, '0')}`;
    await this.showNotification(`完成！總計跑步時間：${timeString}`, 5000, true);
  }

  // 清理資源
  cleanup() {
    if (this.#beatVisualizer && this.#beatVisualizer.parentNode) {
      this.#beatVisualizer.parentNode.removeChild(this.#beatVisualizer);
    }
    this.#beatVisualizer = null;
    this.#isVisualizerActive = false;
  }
}

// 導出類
export default VisualSystem; 