import { crc32 } from './protocol.js';

export const MAX_BYTES = 80;
export const BIT_SECONDS = 0.02;
export const BANDS = Object.freeze({
  high: { tones: [18500, 19500], filter: [18000, 20000], label: '18,5 y 19,5 kHz' },
  audible: { tones: [1200, 2200], filter: [900, 2500], label: '1,2 y 2,2 kHz' },
});
const PREAMBLE = '01'.repeat(24);
const SYNC = (0xd391c5a7 >>> 0).toString(2).padStart(32, '0');
const MARKER = PREAMBLE + SYNC;

function configuration(rate, band) {
  const config = BANDS[band];
  if (!config || !Number.isFinite(rate) || rate < 8000 || rate > 192000 || config.filter[1] >= rate / 2) {
    throw Error('Esta frecuencia de muestreo no admite la banda elegida.');
  }
  return { ...config, samplesPerBit: Math.round(rate * BIT_SECONDS) };
}

export function packetBytes(text) {
  const payload = new TextEncoder().encode(text);
  if (!payload.length || payload.length > MAX_BYTES) throw Error(`Usá un mensaje de 1 a ${MAX_BYTES} bytes UTF-8.`);
  const packet = new Uint8Array(payload.length + 6);
  packet[0] = 1; packet[1] = payload.length; packet.set(payload, 2);
  new DataView(packet.buffer).setUint32(packet.length - 4, crc32(packet.subarray(0, -4)));
  return packet;
}

export function synthesizeHigh(text, { rate = 48000, band = 'high', amplitude = 0.2 } = {}) {
  const { tones, samplesPerBit } = configuration(rate, band);
  if (!(amplitude > 0 && amplitude <= 0.8)) throw Error('Amplitud fuera de rango.');
  const packet = packetBytes(text);
  const bits = MARKER + Array.from(packet, b => b.toString(2).padStart(8, '0')).join('');
  const head = Math.round(rate * 0.3), tail = Math.round(rate * 0.4);
  const samples = new Float32Array(head + bits.length * samplesPerBit + tail);
  const fade = Math.round(rate * 0.01);
  let phase = 0, offset = head;
  for (const bit of bits) {
    const step = 2 * Math.PI * tones[Number(bit)] / rate;
    for (let n = 0; n < samplesPerBit; n++) {
      const index = offset - head, remaining = bits.length * samplesPerBit - 1 - index;
      const ramp = Math.min(1, index / fade, remaining / fade);
      const envelope = 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, ramp));
      samples[offset++] = amplitude * envelope * Math.sin(phase);
      phase = (phase + step) % (2 * Math.PI);
    }
  }
  return { samples, rate, duration: samples.length / rate, payloadBytes: packet[1], bits: bits.length };
}

// Exact-frequency Goertzel, using a Hann window to reduce spectral leakage.
export function tonePower(samples, frequency, rate, start = 0, length = samples.length - start) {
  const coefficient = 2 * Math.cos(2 * Math.PI * frequency / rate);
  let previous = 0, previous2 = 0, sumWindow = 0;
  for (let n = 0; n < length; n++) {
    const window = 0.5 - 0.5 * Math.cos(2 * Math.PI * n / (length - 1));
    const current = samples[start + n] * window + coefficient * previous - previous2;
    previous2 = previous; previous = current; sumWindow += window;
  }
  return Math.max(0, (previous * previous + previous2 * previous2 - coefficient * previous * previous2) * 2 / (sumWindow * sumWindow));
}

export class HighFrequencyDecoder {
  constructor(rate = 48000, band = 'high') {
    const config = configuration(rate, band);
    this.rate = rate; this.tones = config.tones; this.size = config.samplesPerBit;
    this.buffer = new Float32Array(); this.base = 0; this.lock = null; this.disposed = false;
    this.metrics = { zero: 0, one: 0, locked: false, accepted: 0, rejected: 0 };
    this.resetSearch(0);
  }
  resetSearch(position) {
    this.lock = null;
    // Eight timing hypotheses, spaced by 1/8 of a bit period.
    this.tracks = Array.from({ length: 8 }, (_, i) => ({ next: position + Math.round(i * this.size / 8), history: '', reliable: '' }));
  }
  decision(position) {
    const start = position - this.base + Math.round(this.size * 0.2), length = Math.round(this.size * 0.6);
    const zero = tonePower(this.buffer, this.tones[0], this.rate, start, length);
    const one = tonePower(this.buffer, this.tones[1], this.rate, start, length);
    this.metrics.zero = zero; this.metrics.one = one;
    const strongest = Math.max(zero, one), weakest = Math.min(zero, one);
    return { bit: one > zero ? 1 : 0, reliable: strongest > 1e-9 && strongest > 3 * (weakest + 1e-14) };
  }
  push(samples) {
    if (this.disposed) return [];
    const buffer = new Float32Array(this.buffer.length + samples.length);
    buffer.set(this.buffer); buffer.set(samples, this.buffer.length); this.buffer = buffer;
    const end = this.base + this.buffer.length, output = [];
    while (true) {
      if (this.lock) {
        const lock = this.lock;
        if (lock.next + this.size > end) break;
        const decision = this.decision(lock.next); lock.next += this.size;
        lock.byte = (lock.byte << 1) | decision.bit; lock.bitCount++;
        if (lock.bitCount !== 8) continue;
        lock.bytes.push(lock.byte); lock.byte = 0; lock.bitCount = 0;
        if (lock.bytes.length === 2 && (lock.bytes[0] !== 1 || lock.bytes[1] < 1 || lock.bytes[1] > MAX_BYTES)) {
          this.metrics.rejected++; this.resetSearch(lock.next); continue;
        }
        if (lock.bytes.length >= 2 && lock.bytes.length === lock.bytes[1] + 6) {
          const bytes = new Uint8Array(lock.bytes);
          const check = new DataView(bytes.buffer).getUint32(bytes.length - 4);
          if (crc32(bytes.subarray(0, -4)) === check) { output.push(bytes.slice(2, -4)); this.metrics.accepted++; }
          else this.metrics.rejected++;
          this.resetSearch(lock.next);
        }
      } else {
        const track = this.tracks.reduce((a, b) => a.next < b.next ? a : b);
        if (track.next + this.size > end) break;
        const decision = this.decision(track.next); track.next += this.size;
        track.history = (track.history + decision.bit).slice(-MARKER.length);
        track.reliable = (track.reliable + (decision.reliable ? '1' : '0')).slice(-MARKER.length);
        if (track.history === MARKER && !track.reliable.includes('0')) {
          this.lock = { next: track.next, bytes: [], byte: 0, bitCount: 0 };
        }
      }
    }
    this.metrics.locked = !!this.lock;
    const keepFrom = this.lock ? this.lock.next : Math.min(...this.tracks.map(t => t.next));
    const discard = Math.max(0, Math.min(this.buffer.length, keepFrom - this.base));
    this.buffer = this.buffer.slice(discard); this.base += discard;
    return output;
  }
  dispose() { this.disposed = true; this.buffer = new Float32Array(); }
}

export function connectBandpass(context, source, band = 'high') {
  const config = configuration(context.sampleRate, band);
  const highpass = context.createBiquadFilter(), lowpass = context.createBiquadFilter();
  highpass.type = 'highpass'; highpass.frequency.value = config.filter[0]; highpass.Q.value = Math.SQRT1_2;
  lowpass.type = 'lowpass'; lowpass.frequency.value = config.filter[1]; lowpass.Q.value = Math.SQRT1_2;
  source.connect(highpass); highpass.connect(lowpass);
  return { input: highpass, output: lowpass, disconnect() { highpass.disconnect(); lowpass.disconnect(); } };
}
