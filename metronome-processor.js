class MetronomeProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    
    // 180 BPM = 每分鐘 180 拍 = 每拍 333.33ms
    // 採樣率通常是 44100Hz
    this.sampleRate = 44100;
    this.bpm = 180;
    this.samplesPerBeat = Math.floor(this.sampleRate * 60 / this.bpm);
    this.currentSample = 0;
    this.volume = 0.5;
    this.isRunning = false;

    // 監聽來自主線程的消息
    this.port.onmessage = (event) => {
      const { type, value } = event.data;
      switch (type) {
        case 'volume':
          this.volume = value;
          break;
        case 'start':
          this.isRunning = true;
          break;
        case 'stop':
          this.isRunning = false;
          break;
      }
    };
  }

  // 生成點擊音效
  generateClick(sample) {
    if (sample === 0) {
      return 1.0;
    } else if (sample < 50) {
      // 快速衰減，創造清脆的點擊聲
      return 1.0 - (sample / 50);
    }
    return 0;
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const channel = output[0];

    if (!this.isRunning) {
      // 如果沒有運行，輸出靜音
      channel.fill(0);
      return true;
    }

    // 為每個採樣生成音訊
    for (let i = 0; i < channel.length; i++) {
      if (this.currentSample === 0) {
        // 通知主線程發生了一次節拍
        this.port.postMessage({ type: 'beat' });
      }

      // 生成音訊並應用音量
      channel[i] = this.generateClick(this.currentSample) * this.volume;

      // 更新採樣計數
      this.currentSample++;
      if (this.currentSample >= this.samplesPerBeat) {
        this.currentSample = 0;
      }
    }

    // 複製到其他聲道（如果有的話）
    for (let i = 1; i < output.length; i++) {
      output[i].set(channel);
    }

    return true;
  }
}

registerProcessor('metronome-processor', MetronomeProcessor); 