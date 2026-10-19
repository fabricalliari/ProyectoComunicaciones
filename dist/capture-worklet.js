class SonicCapture extends AudioWorkletProcessor {
  constructor() { super(); this.samples = new Float32Array(1024); this.offset = 0; }
  process(inputs, outputs) {
    const channel = inputs[0]?.[0];
    if (channel) for (const value of channel) {
      this.samples[this.offset++] = value;
      if (this.offset === 1024) {
        this.port.postMessage(this.samples, [this.samples.buffer]);
        this.samples = new Float32Array(1024); this.offset = 0;
      }
    }
    for (const output of outputs) for (const channelOut of output) channelOut.fill(0);
    return true;
  }
}
registerProcessor('sonic-capture', SonicCapture);
