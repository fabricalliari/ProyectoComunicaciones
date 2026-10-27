import test from 'node:test';
import assert from 'node:assert/strict';
import { HighFrequencyDecoder, synthesizeHigh, tonePower, packetBytes } from '../dist/high-frequency.js';

function receive(samples, rate = 48000, band = 'high', chunks = 1024) {
  const decoder = new HighFrequencyDecoder(rate, band), found = [];
  for (let offset = 0; offset < samples.length; offset += chunks) found.push(...decoder.push(samples.subarray(offset, offset + chunks)));
  return { texts: found.map(data => new TextDecoder('utf-8', { fatal: true }).decode(data)), decoder };
}

test('FSK 18.500/19.500: recupera UTF-8 desde PCM a 48 y 44,1 kHz, con inicio desalineado', () => {
  for (const rate of [48000, 44100]) {
    const text = '¡Hola iPhone! ñ 🏞️', audio = synthesizeHigh(text, { rate });
    const delayed = new Float32Array(audio.samples.length + 137); delayed.set(audio.samples, 137);
    assert.deepEqual(receive(delayed, rate, 'high', 333).texts, [text]);
  }
});

test('Emite las dos frecuencias propuestas; no usa el perfil ultrasónico multicanal de ggwave', () => {
  const audio = synthesizeHigh('Hola'), start = Math.round(0.3 * audio.rate);
  assert(tonePower(audio.samples, 18500, audio.rate, start, 960) > 100 * tonePower(audio.samples, 19500, audio.rate, start, 960));
  assert(tonePower(audio.samples, 19500, audio.rate, start + 960, 960) > 100 * tonePower(audio.samples, 18500, audio.rate, start + 960, 960));
});

test('Recupera mensajes consecutivos y el máximo de 80 bytes', () => {
  const one = synthesizeHigh('a'.repeat(80)).samples, two = synthesizeHigh('Segundo').samples;
  const samples = new Float32Array(one.length + two.length); samples.set(one); samples.set(two, one.length);
  assert.deepEqual(receive(samples).texts, ['a'.repeat(80), 'Segundo']);
});

test('El CRC rechaza un bit alterado y el receptor vuelve a sincronizar', () => {
  const first = synthesizeHigh('Dañado'), next = synthesizeHigh('Correcto');
  // Flip a payload bit by replacing its tone, keeping the stored CRC unchanged.
  const start = Math.round(0.3 * first.rate) + (80 + 16 + 3) * 960;
  const original = tonePower(first.samples, 18500, first.rate, start, 960) > tonePower(first.samples, 19500, first.rate, start, 960) ? 18500 : 19500;
  for (let n = 0; n < 960; n++) first.samples[start + n] = 0.2 * Math.sin(2 * Math.PI * (original === 18500 ? 19500 : 18500) * n / first.rate);
  const samples = new Float32Array(first.samples.length + next.samples.length); samples.set(first.samples); samples.set(next.samples, first.samples.length);
  const result = receive(samples);
  assert.deepEqual(result.texts, ['Correcto']); assert.equal(result.decoder.metrics.rejected, 1);
});

test('Señal atenuada con ruido controlado y voz sintética de baja frecuencia', () => {
  const audio = synthesizeHigh('Prueba con ruido'), samples = new Float32Array(audio.samples.length); let seed = 1234;
  for (let i = 0; i < samples.length; i++) {
    seed = (1664525 * seed + 1013904223) >>> 0;
    samples[i] = audio.samples[i] * 0.08 + 0.08 * Math.sin(2 * Math.PI * 300 * i / audio.rate) + 0.002 * (seed / 4294967296 * 2 - 1);
  }
  assert.deepEqual(receive(samples).texts, ['Prueba con ruido']);
});

test('El modo audible permite comparar; las bandas no se decodifican entre sí', () => {
  const audio = synthesizeHigh('Comparación', { band: 'audible' });
  assert.deepEqual(receive(audio.samples, 48000, 'audible').texts, ['Comparación']);
  assert.deepEqual(receive(audio.samples).texts, []);
  assert.deepEqual(receive(new Float32Array(96000)).texts, []);
});

test('Valida bytes UTF-8 y Nyquist', () => {
  assert.throws(() => packetBytes('ñ'.repeat(41)), /80/);
  assert.throws(() => packetBytes(''), /1 a 80/);
  assert.throws(() => synthesizeHigh('Hola', { rate: 32000 }), /muestreo/);
});
