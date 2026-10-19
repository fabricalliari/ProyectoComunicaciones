export const RATE = 48000;
export const GAP = 0.45;
export class SampleRateAdapter {
  constructor(inputRate, outputRate = RATE) { this.step = inputRate / outputRate; this.phase = 0; this.last = null; }
  push(samples) {
    if (this.step === 1) return samples;
    const input = new Float32Array(samples.length + (this.last == null ? 0 : 1));
    if (this.last != null) input[0] = this.last;
    input.set(samples, this.last == null ? 0 : 1);
    const output = []; let position = this.phase;
    while (position < input.length - 1) {
      const index = Math.floor(position), fraction = position - index;
      output.push(input[index] * (1 - fraction) + input[index + 1] * fraction); position += this.step;
    }
    this.phase = position - (input.length - 1); this.last = input[input.length - 1];
    return new Float32Array(output);
  }
}
let modulePromise;
export function getEngine() {
  modulePromise ||= window.ggwave_factory({ print: () => {}, printErr: () => {} });
  return modulePromise;
}
export function makeParameters(engine, sampleRate) {
  const p = engine.getDefaultParameters();
  p.sampleRateInp = sampleRate; p.sampleRateOut = sampleRate; return p;
}
export class StreamingDecoder {
  constructor(engine, inputRate) {
    this.engine = engine; this.instance = engine.init(makeParameters(engine, RATE));
    this.adapter = new SampleRateAdapter(inputRate); this.frame = new Float32Array(1024); this.offset = 0;
  }
  push(samples) {
    if (this.instance == null) return [];
    const data = this.adapter.push(samples), results = [];
    // Supply complete 1024-sample frames, including after sample-rate conversion.
    for (const value of data) {
      this.frame[this.offset++] = value;
      if (this.offset === 1024) {
        const decoded = this.engine.decode(this.instance, new Uint8Array(this.frame.buffer));
        if (decoded.length) results.push(new Uint8Array(decoded)); this.offset = 0;
      }
    }
    return results;
  }
  dispose() { if (this.instance != null) { this.engine.free(this.instance); this.instance = null; } }
}
export function samplesOf(engine, encoder, frame) {
  const wave = engine.encode(encoder, frame, engine.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_FAST, 35);
  if (!wave || !wave.length) throw Error('No se pudo generar el sonido.');
  const bytes = new Uint8Array(wave); return new Float32Array(bytes.buffer);
}
export function synthesize(engine, frames) {
  const instance = engine.init(makeParameters(engine, RATE));
  try {
    const pieces = frames.map(frame => samplesOf(engine, instance, frame));
    const gap = Math.round(RATE * GAP), head = Math.round(RATE * 0.3), tail = Math.round(RATE * 0.6);
    const total = pieces.reduce((n, p) => n + p.length, 0) + gap * (pieces.length - 1) + head + tail;
    const samples = new Float32Array(total), ranges = []; let offset = head;
    pieces.forEach((piece, i) => { samples.set(piece, offset); ranges.push({ start: offset / RATE, end: (offset + piece.length) / RATE, index: i }); offset += piece.length + gap; });
    return { samples, rate: RATE, duration: total / RATE, ranges };
  } finally { engine.free(instance); }
}
export function wavBytes(samples, rate = RATE) {
  const result = new Uint8Array(44 + samples.length * 2), v = new DataView(result.buffer);
  const text = (offset, s) => [...s].forEach((c, i) => v.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF'); v.setUint32(4, result.length - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  text(36, 'data'); v.setUint32(40, samples.length * 2, true);
  samples.forEach((value, i) => { const clamped = Math.max(-1, Math.min(1, value)); v.setInt16(44 + i * 2, Math.round(clamped * (clamped < 0 ? 32768 : 32767)), true); });
  return result;
}
export function newAudioContext() {
  const Constructor = window.AudioContext || window.webkitAudioContext;
  if (!Constructor) throw Error('Este navegador no permite procesar audio. Probá Safari actualizado.');
  try { return new Constructor({ sampleRate: RATE }); } catch { return new Constructor(); }
}
