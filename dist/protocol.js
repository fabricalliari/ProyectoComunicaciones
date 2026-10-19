export const LIMIT = 4096;
export const CHUNK = 110;
const HEADER = 18;
export function crc32(data) {
  let c = 0xffffffff;
  for (const b of data) {
    c ^= b;
    for (let n = 0; n < 8; n++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
export function splitTransfer(data, id) {
  if (!(data instanceof Uint8Array) || !data.length || data.length > LIMIT) throw Error('El contenido es demasiado grande para este prototipo.');
  const count = Math.ceil(data.length / CHUNK), checksum = crc32(data);
  return Array.from({ length: count }, (_, i) => {
    const chunk = data.slice(i * CHUNK, (i + 1) * CHUNK);
    const frame = new Uint8Array(HEADER + chunk.length), v = new DataView(frame.buffer);
    frame.set([0x53, 0x44, 1]);
    v.setUint32(3, id >>> 0); v.setUint16(7, i); v.setUint16(9, count);
    v.setUint16(11, data.length); v.setUint32(13, checksum); frame[17] = chunk.length;
    frame.set(chunk, HEADER); return frame;
  });
}
export function parseFrame(value) {
  const f = new Uint8Array(value);
  if (f.length < HEADER || f[0] !== 0x53 || f[1] !== 0x44 || f[2] !== 1) return null;
  const v = new DataView(f.buffer, f.byteOffset, f.byteLength);
  const info = { id: v.getUint32(3), index: v.getUint16(7), count: v.getUint16(9), length: v.getUint16(11), crc: v.getUint32(13) };
  if (info.length < 1 || info.length > LIMIT || info.count !== Math.ceil(info.length / CHUNK) || info.index >= info.count) return null;
  const expected = Math.min(CHUNK, info.length - info.index * CHUNK);
  if (f[17] !== expected || f.length !== HEADER + expected) return null;
  info.data = f.slice(HEADER); return info;
}
export class Receiver {
  reset() { this.active = null; }
  accept(value) {
    const f = parseFrame(value); if (!f) return { ignored: true };
    let a = this.active;
    const started = !a || a.id !== f.id;
    if (!a || a.id !== f.id) a = this.active = { ...f, chunks: new Map(), completed: false };
    if (a.count !== f.count || a.length !== f.length || a.crc !== f.crc) return { error: 'El bloque recibido no coincide con la transferencia.' };
    if (a.completed) return { duplicate: true };
    a.chunks.set(f.index, f.data);
    const status = { started, received: a.chunks.size, count: a.count, missing: Array.from({ length: a.count }, (_, i) => i).filter(i => !a.chunks.has(i)) };
    if (a.chunks.size === a.count) {
      const data = new Uint8Array(a.length);
      for (const [i, bytes] of a.chunks) data.set(bytes, i * CHUNK);
      if (crc32(data) !== a.crc) {
        this.reset(); return { error: 'El contenido no pasó la verificación. Volvé a transmitir.' };
      }
      a.completed = true; return { ...status, complete: true, data };
    }
    return status;
  }
}
function paletteFor(rgba, size = 8) {
  const histogram = new Map();
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    const key = (r >> 3) * 1024 + (g >> 3) * 32 + (b >> 3);
    let entry = histogram.get(key);
    if (!entry) { entry = { r: 0, g: 0, b: 0, n: 0 }; histogram.set(key, entry); }
    entry.r += r; entry.g += g; entry.b += b; entry.n++;
  }
  const colors = [...histogram.values()].map(c => ({ rgb: [c.r / c.n, c.g / c.n, c.b / c.n], n: c.n }));
  const boxes = [colors];
  function axisOf(box) {
    const ranges = [0, 1, 2].map(k => Math.max(...box.map(c => c.rgb[k])) - Math.min(...box.map(c => c.rgb[k])));
    const range = Math.max(...ranges); return { axis: ranges.indexOf(range), range };
  }
  while (boxes.length < size) {
    let best = -1, weight = -1;
    boxes.forEach((box, i) => {
      if (box.length < 2) return;
      const score = axisOf(box).range * box.reduce((n, c) => n + c.n, 0);
      if (score > weight) { weight = score; best = i; }
    });
    if (best < 0) break;
    const box = boxes.splice(best, 1)[0], axis = axisOf(box).axis;
    box.sort((a, b) => a.rgb[axis] - b.rgb[axis]);
    const half = box.reduce((n, c) => n + c.n, 0) / 2;
    let weightSoFar = 0, split = 1;
    for (let i = 0; i < box.length - 1; i++) { weightSoFar += box[i].n; split = i + 1; if (weightSoFar >= half) break; }
    boxes.push(box.slice(0, split), box.slice(split));
  }
  return boxes.map(box => {
    const total = box.reduce((n, c) => n + c.n, 0);
    return [0, 1, 2].map(k => Math.round(box.reduce((n, c) => n + c.rgb[k] * c.n, 0) / total));
  });
}
function pack(indices) {
  const data = new Uint8Array(Math.ceil(indices.length * 3 / 8));
  indices.forEach((value, i) => { for (let k = 0; k < 3; k++) if (value & (1 << (2 - k))) { const bit = i * 3 + k; data[bit >> 3] |= 1 << (7 - bit % 8); } });
  return data;
}
function runLength(indices) {
  const bytes = [];
  for (let i = 0; i < indices.length;) {
    let count = 1; while (count < 32 && i + count < indices.length && indices[i + count] === indices[i]) count++;
    bytes.push(((count - 1) << 3) | indices[i]); i += count;
  }
  return new Uint8Array(bytes);
}
export function encodeImage(rgba, width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 48 || height > 48 || rgba.length !== width * height * 4) throw Error('Dimensiones de imagen no admitidas.');
  const palette = paletteFor(rgba), indices = new Uint8Array(width * height);
  for (let i = 0; i < indices.length; i++) {
    let best = 0, distance = Infinity;
    palette.forEach((color, k) => {
      const d = color.reduce((sum, c, channel) => sum + (c - rgba[i * 4 + channel]) ** 2, 0);
      if (d < distance) { distance = d; best = k; }
    });
    indices[i] = best;
  }
  const packed = pack(indices), rle = runLength(indices), compressed = rle.length < packed.length;
  const body = compressed ? rle : packed, data = new Uint8Array(8 + palette.length * 3 + body.length);
  data.set([0x53, 0x49, 1, 1, width, height, palette.length, compressed ? 1 : 0]);
  palette.forEach((c, i) => data.set(c, 8 + i * 3)); data.set(body, 8 + palette.length * 3);
  return { data, content: decodeContent(data) };
}
export function encodeText(text) {
  const utf8 = new TextEncoder().encode(text);
  if (!utf8.length || utf8.length > 400) throw Error('Escribí un mensaje de hasta 400 bytes.');
  const data = new Uint8Array(4 + utf8.length); data.set([0x53, 0x49, 1, 2]); data.set(utf8, 4); return data;
}
export function decodeContent(data) {
  if (data.length < 4 || data[0] !== 0x53 || data[1] !== 0x49 || data[2] !== 1) throw Error('Formato de contenido no reconocido.');
  if (data[3] === 2) return { type: 'text', text: new TextDecoder('utf-8', { fatal: true }).decode(data.slice(4)) };
  if (data[3] !== 1 || data.length < 11) throw Error('Imagen incompleta.');
  const width = data[4], height = data[5], colors = data[6], method = data[7];
  if (!width || !height || width > 48 || height > 48 || !colors || colors > 8 || method > 1 || data.length < 8 + colors * 3) throw Error('Cabecera de imagen no válida.');
  const pixels = width * height, body = data.slice(8 + colors * 3), indices = [];
  if (method === 1) {
    for (const byte of body) {
      const n = (byte >> 3) + 1, value = byte & 7;
      if (value >= colors || indices.length + n > pixels) throw Error('Datos de imagen incorrectos.');
      for (let i = 0; i < n; i++) indices.push(value);
    }
  } else {
    if (body.length !== Math.ceil(pixels * 3 / 8)) throw Error('Longitud de imagen incorrecta.');
    for (let i = 0; i < pixels; i++) {
      let value = 0; for (let k = 0; k < 3; k++) { const bit = i * 3 + k; value = (value << 1) | ((body[bit >> 3] >> (7 - bit % 8)) & 1); }
      if (value >= colors) throw Error('Color de imagen incorrecto.'); indices.push(value);
    }
  }
  if (indices.length !== pixels) throw Error('La imagen está incompleta.');
  const rgba = new Uint8ClampedArray(pixels * 4);
  indices.forEach((index, i) => { rgba.set(data.slice(8 + index * 3, 11 + index * 3), i * 4); rgba[i * 4 + 3] = 255; });
  return { type: 'image', width, height, colors, rgba };
}
