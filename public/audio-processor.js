class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this._buffer = []
    this._bufferSize = 4000 // 250ms at 16kHz
  }

  process(inputs) {
    const input = inputs[0]
    if (input.length > 0 && input[0].length > 0) {
      const samples = input[0]
      for (let i = 0; i < samples.length; i++) {
        this._buffer.push(samples[i])
      }

      while (this._buffer.length >= this._bufferSize) {
        const chunk = this._buffer.splice(0, this._bufferSize)
        const int16 = new Int16Array(chunk.length)
        for (let i = 0; i < chunk.length; i++) {
          int16[i] = Math.max(-32768, Math.min(32767, Math.round(chunk[i] * 32768)))
        }
        this.port.postMessage(int16.buffer, [int16.buffer])
      }
    }
    return true
  }
}

registerProcessor('audio-processor', AudioProcessor)
