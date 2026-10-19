import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { splitTransfer, Receiver, encodeImage, encodeText, decodeContent } from '../dist/protocol.js';
import { StreamingDecoder, synthesize, wavBytes } from '../dist/audio.js';
const require = createRequire(import.meta.url);
const engine = await require('../dist/vendor/ggwave.js')({ print: () => {}, printErr: () => {} });
function receive(samples, rate) {
  const decoder = new StreamingDecoder(engine, rate), receiver = new Receiver(); let result;
  try {
    for (let offset = 0; offset < samples.length; offset += 1024) {
      for (const frame of decoder.push(samples.subarray(offset, offset + 1024))) { const candidate = receiver.accept(frame); if (candidate.complete) result = candidate; }
    }
    return result;
  } finally { decoder.dispose(); }
}
test('Texto completo por audio FSK generado: no transferir texto directamente al receptor', () => {
  const data = encodeText('Mensaje por sonido: ¡hola iPhone! 🏞️'), audio = synthesize(engine, splitTransfer(data, 2006));
  const received = receive(audio.samples, audio.rate); assert(received?.complete); assert.deepEqual(received.data, data);
  assert.equal(decodeContent(received.data).text, 'Mensaje por sonido: ¡hola iPhone! 🏞️');
});
test('Imagen multibloque: píxeles recuperados desde un WAV PCM de 16 bits', () => {
  const rgba = new Uint8ClampedArray(32 * 24 * 4);
  for (let i = 0; i < 32 * 24; i++) rgba.set([(i % 8) * 32, (i % 3) * 90, (i % 5) * 50, 255], i * 4);
  const image = encodeImage(rgba, 32, 24), audio = synthesize(engine, splitTransfer(image.data, 77));
  const wave = wavBytes(audio.samples, audio.rate), view = new DataView(wave.buffer), quantized = new Float32Array(audio.samples.length);
  for (let i = 0; i < quantized.length; i++) quantized[i] = view.getInt16(44 + i * 2, true) / 32768;
  const received = receive(quantized, audio.rate); assert(received?.complete); assert.deepEqual(received.data, image.data);
  assert.deepEqual(decodeContent(received.data).rgba, image.content.rgba);
  fs.mkdirSync('test-results', { recursive: true }); fs.writeFileSync('test-results/image.wav', wave);
  fs.writeFileSync('test-results/image-expected.json', JSON.stringify({ width: 32, height: 24, rgba: Array.from(image.content.rgba), bytes: image.data.length, seconds: audio.duration }));
});
test('Audio con silencio inicial y ruido leve reproducible', () => {
  const data = encodeText('Prueba de ruido acústico'), audio = synthesize(engine, splitTransfer(data, 5));
  const noisy = new Float32Array(audio.samples.length + 930); let seed = 321;
  for (let i = 0; i < audio.samples.length; i++) { seed = (1664525 * seed + 1013904223) >>> 0; noisy[i + 930] = audio.samples[i] + ((seed / 4294967296) * 2 - 1) * 0.002; }
  assert.deepEqual(receive(noisy, 48000)?.data, data);
});
test('Entrada a 44,1 kHz: adaptación a distintas frecuencias de muestreo', () => {
  const data = encodeText('Entrada de audio a 44100 Hz'), audio = synthesize(engine, splitTransfer(data, 6));
  const resampled = new Float32Array(Math.floor(audio.samples.length * 44100 / 48000));
  for (let i = 0; i < resampled.length; i++) { const position = i * 48000 / 44100, index = Math.floor(position), fraction = position - index; resampled[i] = audio.samples[index] * (1 - fraction) + (audio.samples[index + 1] || 0) * fraction; }
  assert.deepEqual(receive(resampled, 44100)?.data, data);
});
