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
    
    // 基本設置
    this.sampleRate = 44100;
    this.bpm = 180;
    this.samplesPerBeat = Math.floor(this.sampleRate * 60 / this.bpm);
    
    // 計數器
    this.currentSample = 0;
    this.clickDuration = Math.floor(this.sampleRate * 0.02); // 20ms
    this.nextClickTime = 0;
    
    // 狀態
    this.isRunning = false;
    this.isHighPitch = true;

    // 監聽消息
    this.port.onmessage = (event) => {
      if (event.data.type === 'start') {
        this.isRunning = true;
        this.currentSample = 0;
        this.nextClickTime = 0;
      } else if (event.data.type === 'stop') {
        this.isRunning = false;
        this.currentSample = 0;
        this.nextClickTime = 0;
        this.isHighPitch = true;
      }
    };
  }

  generateClick(sampleIndex) {
    if (sampleIndex >= this.clickDuration) {
      return 0;
    }
    
    const frequency = this.isHighPitch ? 800 : 600;
    const t = sampleIndex / this.sampleRate;
    const oscillator = Math.sin(2 * Math.PI * frequency * t);
    const envelope = Math.exp(-sampleIndex / (this.clickDuration * 0.2));
    
    return oscillator * envelope;
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const volume = parameters.volume?.[0] ?? 0.5;

    if (!this.isRunning) {
      output.forEach(channel => channel.fill(0));
      return true;
    }

    // 處理所有聲道
    for (const channel of output) {
      for (let i = 0; i < channel.length; i++) {
        let sample = 0;
        
        // 檢查是否需要播放新的點擊聲
        if (this.currentSample >= this.nextClickTime) {
          // 發送節拍消息
          this.port.postMessage({
            type: 'beat',
            isHighPitch: this.isHighPitch
          });
          
          // 切換音高並設置下一個點擊時間
          this.isHighPitch = !this.isHighPitch;
          this.nextClickTime = this.currentSample + this.samplesPerBeat;
        }
        
        // 計算當前點擊的採樣索引
        const timeSinceClick = this.currentSample - (this.nextClickTime - this.samplesPerBeat);
        if (timeSinceClick >= 0 && timeSinceClick < this.clickDuration) {
          sample = this.generateClick(timeSinceClick);
        }
        
        // 寫入聲道並更新計數器
        channel[i] = sample * volume;
        this.currentSample++;
      }
    }

    return true;
  }
}

registerProcessor('metronome-processor', MetronomeProcessor); 