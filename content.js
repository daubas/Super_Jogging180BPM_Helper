// 音訊上下文和音效緩存
let audioContext = null;
let clickBuffer = null;

// 初始化音訊系統
async function initAudioSystem() {
  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      // 預加載音效
      const response = await fetch(chrome.runtime.getURL('assets/click.mp3'));
      const arrayBuffer = await response.arrayBuffer();
      clickBuffer = await audioContext.decodeAudioData(arrayBuffer);
    }
    
    // 如果音訊上下文被暫停，嘗試恢復
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
  } catch (error) {
    console.error('音訊系統初始化失敗:', error);
  }
}

// 確保頁面加載時初始化音訊系統
document.addEventListener('DOMContentLoaded', initAudioSystem);

// 用戶互動時確保音訊系統啟動
document.addEventListener('click', initAudioSystem);

// 播放節拍器聲音
async function playMetronomeSound(volume) {
  try {
    // 確保音訊系統已初始化
    await initAudioSystem();
    
    if (audioContext && clickBuffer) {
      const source = audioContext.createBufferSource();
      const gainNode = audioContext.createGain();
      
      source.buffer = clickBuffer;
      gainNode.gain.value = volume / 100;
      
      source.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      source.start(0);
    }
  } catch (error) {
    console.error('播放音效失敗:', error);
    
    // 如果 Web Audio API 失敗，嘗試使用傳統的 Audio API
    try {
      const sound = new Audio(chrome.runtime.getURL('assets/click.mp3'));
      sound.volume = volume / 100;
      await sound.play();
    } catch (fallbackError) {
      console.error('備用音效播放也失敗:', fallbackError);
    }
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
    case 'showTimeNotification':
      showTimeNotification(request.time);
      break;
    case 'completed':
      showCompletionNotification(request.time);
      break;
    case 'playMetronome':
      playMetronomeSound(request.volume);
      break;
    case 'test':
      // 測試功能
      showFullscreenNotification('測試提示', 3000);
      playMetronomeSound(request.volume || 50);
      break;
    case 'syncState':
      // 同步狀態
      if (request.isRunning) {
        showStatusNotification('計時器正在運行中');
        // 確保音訊系統已啟動
        initAudioSystem();
      }
      break;
    case 'stop':
      showStatusNotification('計時器已停止');
      break;
  }
}); 