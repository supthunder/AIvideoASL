// AudioWorklet that downsamples the microphone stream to 16 kHz mono Int16 PCM
// chunks (what Gemini Live expects). The AudioContext must be opened at
// sampleRate: 16000 for this to be a no-op resample — otherwise we'd need a
// proper polyphase filter. Chrome/Firefox both honour AudioContext sample-rate
// requests when the hardware supports it.

class PcmRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = [];
    this._target = 1600; // 100 ms of audio at 16 kHz
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i++) {
      // Clamp Float32 [-1, 1] -> Int16.
      let s = channel[i];
      if (s > 1) s = 1;
      else if (s < -1) s = -1;
      this._buffer.push(s < 0 ? s * 0x8000 : s * 0x7fff);
    }

    while (this._buffer.length >= this._target) {
      const slice = this._buffer.splice(0, this._target);
      const pcm = new Int16Array(slice.length);
      for (let i = 0; i < slice.length; i++) pcm[i] = slice[i];
      this.port.postMessage(pcm.buffer, [pcm.buffer]);
    }
    return true;
  }
}

registerProcessor("pcm-recorder", PcmRecorderProcessor);
