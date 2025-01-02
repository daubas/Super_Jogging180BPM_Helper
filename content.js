// 音訊系統
let audioContext = null;
let metronomeNode = null;
let isMetronomeRunning = false;

// 清理音訊系統
async function cleanupAudioSystem() {
  isMetronomeRunning = false;
  if (metronomeNode) {
    metronomeNode.disconnect();
    metronomeNode = null;
  }
  if (audioContext) {
    await audioContext.close();
    audioContext = null;
  }
}

// 創建視覺化節拍指示器
function createBeatVisualizer() {
  const visualizer = document.createElement('div');
  visualizer.id = 'beat-visualizer';
  visualizer.style.cssText = `
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
  `;
  document.body.appendChild(visualizer);
  return visualizer;
}

let beatVisualizer = null;
let isVisualizerActive = false;

// 初始化視覺元素
function initializeVisualElements() {
  if (!beatVisualizer) {
    beatVisualizer = createBeatVisualizer();
  }
}

// 更新視覺化顯示
function updateVisualizerDisplay(show = true) {
  if (!beatVisualizer) {
    initializeVisualElements();
  }
  
  beatVisualizer.style.display = show ? 'block' : 'none';
  isVisualizerActive = show;
}

// 視覺化節拍
function visualizeBeat(isHighPitch = true) {
  if (!isVisualizerActive || !beatVisualizer) return;
  
  // 根據高低音變化顏色
  const color = isHighPitch ? 'rgba(76, 175, 80, 0.8)' : 'rgba(33, 150, 243, 0.8)';
  
  beatVisualizer.style.transform = 'scale(1.2)';
  beatVisualizer.style.backgroundColor = color;
  
  setTimeout(() => {
    if (isVisualizerActive) {
      beatVisualizer.style.transform = 'scale(1)';
    }
  }, 100);
}

// 初始化音訊系統
async function initAudioSystem(isTest = false) {
  try {
    // 檢查瀏覽器支援
    if (!window.AudioContext && !window.webkitAudioContext) {
      throw new Error('瀏覽器不支援 AudioContext');
    }

    // 檢查現有系統並確保清理
    await cleanupAudioSystem();
    
    // 等待一小段時間確保完全清理
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // 創建新的音訊上下文
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // 等待音訊上下文初始化
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // 確保音訊上下文已啟動
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    // 檢查 AudioWorklet 支援
    if (!audioContext.audioWorklet) {
      throw new Error('瀏覽器不支援 AudioWorklet');
    }

    try {
      // 載入 AudioWorklet
      const workletUrl = chrome.runtime.getURL('metronome-processor.js');
      await audioContext.audioWorklet.addModule(workletUrl);
      
      // 等待 AudioWorklet 加載完成
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // 創建節點
      metronomeNode = new AudioWorkletNode(audioContext, 'metronome-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: {
          sampleRate: audioContext.sampleRate
        }
      });
      
      // 確保節點創建成功
      if (!metronomeNode) {
        throw new Error('無法創建 AudioWorkletNode');
      }
      
      // 連接節點
      metronomeNode.connect(audioContext.destination);
      
      // 設置消息處理
      metronomeNode.port.onmessage = (event) => {
        if (event.data.type === 'beat') {
          visualizeBeat(event.data.isHighPitch);
        }
      };

      // 設置默認音量
      try {
        const volumeParam = metronomeNode.parameters.get('volume');
        if (volumeParam) {
          volumeParam.setValueAtTime(0.5, audioContext.currentTime);
        }
      } catch (error) {
        console.warn('設置默認音量失敗:', error);
      }

      return true;
    } catch (error) {
      console.error('AudioWorklet 初始化失敗:', error);
      await cleanupAudioSystem();
      throw error;
    }
  } catch (error) {
    console.error('音訊系統初始化失敗:', error);
    
    if (!isTest) {
      if (error.name === 'NotAllowedError') {
        showStatusNotification('請先與頁面互動以啟用音訊');
      } else if (error.name === 'NotSupportedError' || error.message.includes('不支援')) {
        showStatusNotification('瀏覽器不支援所需的音訊功能');
      } else {
        showStatusNotification('音訊系統初始化失敗，請重試');
      }
    }
    
    await cleanupAudioSystem();
    return false;
  }
}

// 確保在用戶互動後初始化
document.addEventListener('click', async () => {
  try {
    if (!audioContext) {
      await initAudioSystem();
    } else if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
  } catch (error) {
    console.error('音訊系統初始化失敗:', error);
  }
}, { once: true });

// 倒數計時
async function countdown(seconds) {
  // 通知 background 倒數開始，暫停計時
  chrome.runtime.sendMessage({ action: 'countdownStarted' });

  const countdownOverlay = document.createElement('div');
  countdownOverlay.style.cssText = `
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
  `;
  document.body.appendChild(countdownOverlay);

  for (let i = seconds; i > 0; i--) {
    countdownOverlay.textContent = i;
    countdownOverlay.style.opacity = '1';
    countdownOverlay.style.transform = 'translate(-50%, -50%) scale(1)';
    
    await new Promise(resolve => setTimeout(resolve, 800));
    
    countdownOverlay.style.opacity = '0';
    countdownOverlay.style.transform = 'translate(-50%, -50%) scale(0.8)';
    
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  countdownOverlay.textContent = '開始';
  countdownOverlay.style.opacity = '1';
  countdownOverlay.style.transform = 'translate(-50%, -50%) scale(1.2)';
  
  await new Promise(resolve => setTimeout(resolve, 800));
  
  countdownOverlay.style.opacity = '0';
  countdownOverlay.style.transform = 'translate(-50%, -50%) scale(0.8)';
  
  await new Promise(resolve => setTimeout(resolve, 200));
  
  document.body.removeChild(countdownOverlay);

  // 通知 background 倒數結束，開始計時
  chrome.runtime.sendMessage({ action: 'countdownCompleted' });
}

// 播放節拍器聲音
async function startMetronome(volume, skipCountdown = false) {
  try {
    // 如果已經在運行，先停止
    if (isMetronomeRunning) {
      stopMetronome();
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // 初始化音訊系統
    const initialized = await initAudioSystem();
    if (!initialized) {
      throw new Error('音訊系統初始化失敗');
    }
    
    // 確保音訊系統就緒
    if (!audioContext || !metronomeNode) {
      throw new Error('音訊系統未就緒');
    }
    
    // 確保音訊上下文處於運行狀態
    if (audioContext.state !== 'running') {
      await audioContext.resume();
    }
    
    // 只在首次啟動時進行倒數
    if (!skipCountdown) {
      await countdown(3);
    } else {
      // 如果跳過倒數，直接通知開始計時
      chrome.runtime.sendMessage({ action: 'countdownCompleted' });
    }
    
    updateVisualizerDisplay(true);
    
    // 設置音量
    try {
      const volumeParam = metronomeNode.parameters.get('volume');
      if (volumeParam) {
        volumeParam.setValueAtTime(volume / 100, audioContext.currentTime);
      } else {
        console.warn('無法設置音量參數');
      }
    } catch (error) {
      console.warn('設置音量失敗:', error);
    }
    
    // 標記為運行中
    isMetronomeRunning = true;
    
    // 開始播放
    try {
      metronomeNode.port.postMessage({
        type: 'start',
        volume: volume / 100
      });
    } catch (error) {
      console.error('啟動播放失敗:', error);
      throw error;
    }
  } catch (error) {
    console.error('節拍器啟動失敗:', error);
    showStatusNotification('節拍器啟動失敗，請重試');
    isMetronomeRunning = false;
    await cleanupAudioSystem();
  }
}

// 停止節拍器
function stopMetronome() {
  if (metronomeNode) {
    metronomeNode.port.postMessage({
      type: 'stop'
    });
    updateVisualizerDisplay(false);
    isMetronomeRunning = false;
  }
}

// 創建全屏提示元素
function createFullscreenOverlay() {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
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
  `;
  
  const content = document.createElement('div');
  content.style.cssText = `
    background: rgba(255, 255, 255, 0.9);
    padding: 30px 50px;
    border-radius: 15px;
    box-shadow: 0 0 20px rgba(0, 0, 0, 0.3);
    text-align: center;
    font-family: 'Arial', sans-serif;
    transform: scale(0.9);
    transition: transform 1s ease-in-out;
  `;
  
  overlay.appendChild(content);
  return { overlay, content };
}

// 顯示全屏提示
function showFullscreenNotification(message, duration = 3000, isSuccess = false) {
  const { overlay, content } = createFullscreenOverlay();
  content.style.backgroundColor = isSuccess ? 'rgba(76, 175, 80, 0.9)' : 'rgba(255, 255, 255, 0.9)';
  content.style.color = isSuccess ? 'white' : 'black';
  content.innerHTML = `
    <h2 style="margin: 0; font-size: 24px;">${message}</h2>
  `;
  
  document.body.appendChild(overlay);
  
  // 觸發動畫
  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
    content.style.transform = 'scale(1)';
  });
  
  // 設定消失時間
  setTimeout(() => {
    overlay.style.opacity = '0';
    content.style.transform = 'scale(0.9)';
    setTimeout(() => {
      document.body.removeChild(overlay);
    }, 1000);
  }, duration);
}

// 顯示時間提示
function showTimeNotification(time) {
  const minutes = Math.floor(time / 60);
  const seconds = time % 60;
  const timeString = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  showFullscreenNotification(`已跑 ${timeString}`);
}

// 顯示完成提示
function showCompletionNotification(time) {
  const minutes = Math.floor(time / 60);
  const timeString = `${String(minutes).padStart(2, '0')}:${String(0).padStart(2, '0')}`;
  showFullscreenNotification(`完成！總計跑步時間：${timeString}`, 5000, true);
}

// 顯示狀態提示
function showStatusNotification(message) {
  showFullscreenNotification(message, 2000);
}

// 監聽來自 background 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'initAudio':
      // 確保在初始化前清理
      cleanupAudioSystem().then(() => {
        return initAudioSystem(true);
      }).then(() => {
        sendResponse(true);
      }).catch((error) => {
        console.error('音訊系統初始化失敗:', error);
        sendResponse(false);
      });
      return true;
      
    case 'showTimeNotification':
      showTimeNotification(request.time);
      break;
      
    case 'completed':
      showCompletionNotification(request.time);
      stopMetronome();
      break;
      
    case 'playMetronome':
      // 確保停止所有現有的播放
      cleanupAudioSystem().then(async () => {
        // 檢查是否為暫停後重啟
        const wasRunning = isMetronomeRunning;
        await startMetronome(request.volume, wasRunning);
      });
      break;
      
    case 'test':
      // 確保停止所有現有的播放
      cleanupAudioSystem().then(async () => {
        showStatusNotification('測試模式');
        await startMetronome(request.volume || 50, false);
        setTimeout(() => {
          stopMetronome();
          showStatusNotification('測試完成');
        }, 4000);
      });
      break;
      
    case 'syncState':
      if (request.isRunning) {
        startMetronome(request.volume, true);
      } else {
        stopMetronome();
      }
      break;
      
    case 'stop':
      stopMetronome();
      break;
      
    case 'updateVolume':
      if (metronomeNode) {
        const volumeParam = metronomeNode.parameters.get('volume');
        if (volumeParam) {
          volumeParam.setValueAtTime(request.volume / 100, audioContext.currentTime);
        }
      }
      break;
  }
}); 