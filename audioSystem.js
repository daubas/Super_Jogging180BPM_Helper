class AudioSystem {
  // 常量定義
  static #SAMPLE_RATE = 44100;
  static #DELAY_TIME = 100;
  static #DEFAULT_VOLUME = 0.5;
  static #WORKLET_CODE = `
    class MetronomeProcessor extends AudioWorkletProcessor {
      static get parameterDescriptors() {
        return [{
          name: 'volume',
          defaultValue: 0.5,
          minValue: 0,
          maxValue: 1
        }];
      }
    
      constructor() {
        super();
        this.isPlaying = false;
        this.nextTickTime = 0;
        this.tickInterval = 60 / 180; // 180 BPM
        this.beatCount = 0;
        
        this.port.onmessage = (event) => {
          if (event.data.type === 'start') {
            this.isPlaying = true;
            this.nextTickTime = currentTime;
          } else if (event.data.type === 'stop') {
            this.isPlaying = false;
          }
        };
      }
    
      process(inputs, outputs, parameters) {
        const output = outputs[0];
        const volume = parameters.volume[0];
        
        if (!this.isPlaying) return true;
        
        const currentTime = currentFrame / sampleRate;
        
        if (currentTime >= this.nextTickTime) {
          const isHighPitch = this.beatCount % 4 === 0;
          this.port.postMessage({ type: 'beat', isHighPitch });
          
          // 生成點擊聲
          const frequency = isHighPitch ? 1000 : 800;
          const clickDuration = 0.02; // 20ms
          const numSamples = Math.floor(clickDuration * sampleRate);
          
          for (let channel = 0; channel < output.length; ++channel) {
            const outputChannel = output[channel];
            for (let i = 0; i < outputChannel.length; ++i) {
              if (i < numSamples) {
                const t = i / sampleRate;
                // 使用正弦波生成聲音
                outputChannel[i] = Math.sin(2 * Math.PI * frequency * t) *
                  // 應用音量和淡出效果
                  volume * (1 - i / numSamples);
              } else {
                outputChannel[i] = 0;
              }
            }
          }
          
          this.beatCount++;
          this.nextTickTime += this.tickInterval;
        }
        
        return true;
      }
    }
    
    registerProcessor('metronome-processor', MetronomeProcessor);
  `;
  
  // 私有屬性
  #audioContext = null;
  #metronomeNode = null;
  #onBeat = null;
  #isInitialized = false;
  #isPlaying = false;
  #currentVolume = AudioSystem.#DEFAULT_VOLUME;
  #initializationPromise = null;
  #stateChangePromise = null;

  /**
   * 創建音訊系統實例
   * @param {Function} onBeat - 節拍回調函數
   */
  constructor(onBeat = null) {
    this.#onBeat = onBeat;
  }

  /**
   * 等待指定時間
   * @param {number} ms - 等待時間（毫秒）
   */
  static async #delay(ms = AudioSystem.#DELAY_TIME) {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 初始化音訊系統
   * @returns {Promise<boolean>} 初始化是否成功
   */
  async initialize() {
    if (this.#initializationPromise) {
      return await this.#initializationPromise;
    }

    if (this.#isInitialized) {
      await this.cleanup();
    }

    this.#initializationPromise = this.#initializeInternal();
    try {
      return await this.#initializationPromise;
    } finally {
      this.#initializationPromise = null;
    }
  }

  /**
   * 內部初始化邏輯
   * @returns {Promise<boolean>} 初始化是否成功
   */
  async #initializeInternal() {
    try {
      if (!this.#checkBrowserSupport()) {
        throw new Error('瀏覽器不支援 AudioContext');
      }

      await this.#createAudioContext();
      await this.#setupAudioWorklet();
      await this.#createMetronomeNode();

      this.#isInitialized = true;
      return true;
    } catch (error) {
      console.error('音訊系統初始化失敗:', error);
      await this.cleanup();
      return false;
    }
  }

  /**
   * 檢查瀏覽器支援
   * @returns {boolean} 是否支援
   */
  #checkBrowserSupport() {
    return !!(window.AudioContext || window.webkitAudioContext);
  }

  /**
   * 創建音訊上下文
   */
  async #createAudioContext() {
    if (!this.#audioContext || this.#audioContext.state === 'closed') {
      this.#audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: AudioSystem.#SAMPLE_RATE
      });
    }
    await AudioSystem.#delay();
  }

  /**
   * 設置音訊工作線程
   */
  async #setupAudioWorklet() {
    const blob = new Blob([AudioSystem.#WORKLET_CODE], { type: 'application/javascript' });
    const workletUrl = URL.createObjectURL(blob);
    
    try {
      await this.#audioContext.audioWorklet.addModule(workletUrl);
      await AudioSystem.#delay();
    } finally {
      URL.revokeObjectURL(workletUrl);
    }
  }

  /**
   * 創建節拍器節點
   */
  async #createMetronomeNode() {
    this.#metronomeNode = new AudioWorkletNode(this.#audioContext, 'metronome-processor', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: {
        sampleRate: this.#audioContext.sampleRate
      }
    });

    this.#setupMetronomeMessageHandler();
    this.#metronomeNode.connect(this.#audioContext.destination);
  }

  /**
   * 設置節拍器消息處理
   */
  #setupMetronomeMessageHandler() {
    this.#metronomeNode.port.onmessage = (event) => {
      if (event.data.type === 'beat' && this.#isPlaying && this.#onBeat) {
        requestAnimationFrame(() => {
          if (this.#isPlaying && this.#onBeat) {
            this.#onBeat(event.data.isHighPitch);
          }
        });
      }
    };
  }

  /**
   * 開始播放
   * @param {number} volume - 音量 (0-1)
   */
  async start(volume = AudioSystem.#DEFAULT_VOLUME) {
    try {
      await this.#waitForStateChange();
      
      this.#stateChangePromise = this.#startInternal(volume);
      await this.#stateChangePromise;
    } catch (error) {
      console.error('節拍器啟動失敗:', error);
      this.#isPlaying = false;
      throw error;
    } finally {
      this.#stateChangePromise = null;
    }
  }

  /**
   * 內部開始播放邏輯
   * @param {number} volume - 音量 (0-1)
   */
  async #startInternal(volume) {
    if (this.#isPlaying) {
      await this.#stopAndReinitialize();
    }

    await this.#ensureInitialized();
    await this.#resumeAudioContext();
    await this.#setVolumeAndStart(volume);
  }

  /**
   * 停止並重新初始化
   */
  async #stopAndReinitialize() {
    this.#isPlaying = false;
    await AudioSystem.#delay();
    
    if (this.#metronomeNode) {
      this.#metronomeNode.port.postMessage({ type: 'stop' });
      await AudioSystem.#delay();
    }
    
    await this.cleanup();
    await this.initialize();
  }

  /**
   * 確保系統已初始化
   */
  async #ensureInitialized() {
    if (!this.#isInitialized) {
      const success = await this.initialize();
      if (!success) {
        throw new Error('音訊系統初始化失敗');
      }
    }
  }

  /**
   * 恢復音訊上下文
   */
  async #resumeAudioContext() {
    if (this.#audioContext.state === 'suspended') {
      await this.#audioContext.resume();
      await AudioSystem.#delay();
    }
  }

  /**
   * 設置音量並開始播放
   * @param {number} volume - 音量 (0-1)
   */
  async #setVolumeAndStart(volume) {
    if (!this.#metronomeNode) {
      throw new Error('節拍器節點未初始化');
    }

    this.#currentVolume = volume;
    const volumeParam = this.#metronomeNode.parameters.get('volume');
    if (volumeParam) {
      volumeParam.setValueAtTime(volume, this.#audioContext.currentTime);
    }

    this.#isPlaying = true;
    this.#metronomeNode.port.postMessage({ type: 'start' });
  }

  /**
   * 停止播放
   */
  async stop() {
    try {
      this.#isPlaying = false;
      await AudioSystem.#delay();

      if (this.#metronomeNode) {
        this.#metronomeNode.port.postMessage({ type: 'stop' });
        await AudioSystem.#delay();
      }
    } catch (error) {
      console.error('節拍器停止失敗:', error);
    }
  }

  /**
   * 清理資源
   */
  async cleanup() {
    try {
      this.#isPlaying = false;
      await AudioSystem.#delay();

      if (this.#metronomeNode) {
        this.#metronomeNode.port.postMessage({ type: 'stop' });
        await AudioSystem.#delay();
        this.#metronomeNode.disconnect();
        this.#metronomeNode = null;
      }

      if (this.#audioContext?.state !== 'closed') {
        await this.#audioContext?.close();
        this.#audioContext = null;
      }

      this.#isInitialized = false;
      this.#currentVolume = AudioSystem.#DEFAULT_VOLUME;
    } catch (error) {
      console.error('清理資源失敗:', error);
    }
  }

  /**
   * 等待狀態改變完成
   */
  async #waitForStateChange() {
    if (this.#stateChangePromise) {
      await this.#stateChangePromise;
    }
  }

  /**
   * 設置音量
   * @param {number} volume - 音量 (0-1)
   */
  async setVolume(volume) {
    if (this.#metronomeNode && this.#isPlaying) {
      this.#currentVolume = volume;
      const volumeParam = this.#metronomeNode.parameters.get('volume');
      if (volumeParam) {
        volumeParam.setValueAtTime(volume, this.#audioContext.currentTime);
      }
    }
  }

  /**
   * 獲取當前狀態
   */
  get state() {
    return {
      isInitialized: this.#isInitialized,
      isPlaying: this.#isPlaying,
      currentVolume: this.#currentVolume,
      audioContextState: this.#audioContext?.state || 'closed'
    };
  }
}

export default AudioSystem; 