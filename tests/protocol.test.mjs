import test from 'node:test';
import assert from 'node:assert/strict';
import { crc32, splitTransfer, parseFrame, Receiver, encodeText, encodeImage, decodeContent } from '../dist/protocol.js';
test('CRC-32: vector estándar, vacío y modificación de datos', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  assert.equal(crc32(new Uint8Array()), 0);
  assert.notEqual(crc32(new Uint8Array([0, 1])), crc32(new Uint8Array([0, 0])));
});
for (const size of [1, 109, 110, 111, 220, 416, 4096]) test(`Trama binaria de ${size} bytes: reordenamiento y duplicados`, () => {
  const data = Uint8Array.from({ length: size }, (_, i) => (i * 37) & 255), frames = splitTransfer(data, 0xff81ff01);
  assert(frames.every(f => f.length <= 128));
  const receiver = new Receiver(); let result;
  for (const frame of [...frames].reverse()) { result = receiver.accept(frame); if (!result.complete) receiver.accept(frame); }
  assert(result.complete); assert.deepEqual(result.data, data);
  assert(receiver.accept(frames[0]).duplicate);
});
test('Los bloques faltantes se completan al retransmitir', () => {
  const data = new Uint8Array(350).fill(255), frames = splitTransfer(data, 34), receiver = new Receiver();
  receiver.accept(frames[0]); const missing = receiver.accept(frames[2]);
  assert.deepEqual(missing.missing, [1, 3]);
  receiver.accept(frames[1]); assert(receiver.accept(frames[3]).complete);
});
test('No aceptar contenido corrupto aunque estén todos los bloques', () => {
  const frames = splitTransfer(new Uint8Array(130).fill(12), 21), receiver = new Receiver();
  frames[0][20] ^= 1; receiver.accept(frames[0]); assert(receiver.accept(frames[1]).error); assert.equal(receiver.active, null);
});
test('Cabeceras incompletas, límites y metadatos inconsistentes', () => {
  assert.equal(parseFrame(new Uint8Array(2)), null);
  const frame = splitTransfer(new Uint8Array(200), 1)[0];
  assert.equal(parseFrame(frame.slice(0, -1)), null);
  const receiver = new Receiver(); receiver.accept(frame);
  const changed = new Uint8Array(frame); changed[13] ^= 1; assert(receiver.accept(changed).error);
  assert.throws(() => splitTransfer(new Uint8Array(4097), 1));
});
test('Una nueva transferencia reemplaza la anterior y reinicio', () => {
  const receiver = new Receiver(); receiver.accept(splitTransfer(new Uint8Array(200), 1)[0]);
  const result = receiver.accept(splitTransfer(new Uint8Array([8]), 2)[0]); assert(result.started && result.complete); assert.equal(result.data[0], 8);
  receiver.reset(); assert.equal(receiver.active, null);
});
test('Texto UTF-8, emojis y límites por bytes', () => {
  const text = '¡Llegó! 🏞️ Coordenadas: -34.60, -58.38';
  assert.equal(decodeContent(encodeText(text)).text, text);
  assert.throws(() => encodeText(''));
  assert.throws(() => encodeText('😀'.repeat(101)));
});
for (const [width, height] of [[1, 1], [24, 17], [32, 32], [48, 48]]) test(`Imagen ${width}×${height}: dimensiones, píxeles y paleta`, () => {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) rgba.set([i % 2 ? 255 : 0, 30, 80, 255], i * 4);
  const encoded = encodeImage(rgba, width, height), content = decodeContent(encoded.data);
  assert.equal(content.width, width); assert.equal(content.height, height); assert.equal(content.colors, Math.min(2, width * height));
  assert.deepEqual(content.rgba, rgba); assert(encoded.data.length <= 896);
});
test('Compresión de imagen uniforme y detección de truncamiento', () => {
  const image = new Uint8ClampedArray(32 * 32 * 4).fill(255), encoded = encodeImage(image, 32, 32);
  assert.equal(encoded.data[7], 1); assert(encoded.data.length < 50);
  assert.deepEqual(decodeContent(encoded.data).rgba, image);
  assert.throws(() => decodeContent(encoded.data.slice(0, -1)));
});
test('Cuantización de una imagen fotográfica simulada y datos malformados', () => {
  const image = Uint8ClampedArray.from({ length: 48 * 48 * 4 }, (_, i) => i % 4 === 3 ? 255 : (i * 47) & 255);
  const { data, content } = encodeImage(image, 48, 48); assert.equal(content.colors, 8); assert(data.length <= 896);
  const corrupt = new Uint8Array(data); corrupt[6] = 0; assert.throws(() => decodeContent(corrupt));
  assert.throws(() => encodeImage(image, 49, 48)); assert.throws(() => decodeContent(new Uint8Array([1, 2, 3, 4])));
});
