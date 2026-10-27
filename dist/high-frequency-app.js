import { BANDS, MAX_BYTES, HighFrequencyDecoder, connectBandpass, packetBytes, synthesizeHigh } from './high-frequency.js';
import { newAudioContext, wavBytes } from './audio.js';

const element = id => document.getElementById(id);
let playback = null, capture = null, busy = false, operation = 0;
const currentBand = () => element('band').value;
const status = (text, error = false) => {
  element('labStatus').textContent = text;
  element('labStatusTitle').textContent = error ? 'Revisá la prueba' : capture ? 'Escuchando' : playback ? 'Emitiendo sonido' : 'Listo para probar';
  document.querySelector('.signal-card').classList.toggle('error', error);
};
function controls() {
  const active = !!playback || !!capture || busy;
  for (const id of ['band', 'labMessage', 'toneZero', 'toneOne', 'labDigital', 'labAudioFile', 'labDownload']) element(id).disabled = active;
  let valid = false;
  try { packetBytes(element('labMessage').value); valid = true; } catch { }
  element('labSend').disabled = active || !valid;
  element('labDownload').disabled = active || !valid;
  element('labDigital').disabled = active || !valid;
  element('labListen').disabled = busy || !!playback;
  element('labListen').textContent = capture ? 'Detener micrófono' : 'Activar micrófono';
  element('labStopSend').hidden = !playback;
}
function describe() {
  const config = BANDS[currentBand()], count = new TextEncoder().encode(element('labMessage').value).length;
  element('byteCount').textContent = `${count} / ${MAX_BYTES} bytes`;
  element('frequencyZero').textContent = `${config.tones[0].toLocaleString('es-AR')} Hz`;
  element('frequencyOne').textContent = `${config.tones[1].toLocaleString('es-AR')} Hz`;
  element('bandHint').textContent = `FSK binaria · 50 bits/s · filtro ${config.filter[0] / 1000}–${config.filter[1] / 1000} kHz.` + (currentBand() === 'high' ? ' Algunas personas pueden escuchar estos tonos.' : ' Banda audible para comparar.');
  try { const audio = synthesizeHigh(element('labMessage').value, { band: currentBand() }); element('duration').textContent = `${count} bytes · ${audio.duration.toFixed(1)} s de audio · incluye sincronización y CRC`; }
  catch (error) { element('duration').textContent = error.message; }
  controls();
}
function stopPlayback(completed = false) {
  if (!playback) return;
  const previous = playback; playback = null;
  previous.source.onended = null;
  try { previous.source.stop(); } catch { }
  previous.source.disconnect(); void previous.context.close().catch(() => {});
  if (previous.wakeLock) void previous.wakeLock.release().catch(() => {});
  controls(); status(completed ? 'Sonido emitido. Comprobá el resultado en el otro dispositivo.' : 'Sonido detenido.');
}
async function play(tone = null) {
  if (playback || capture || busy) return;
  const context = newAudioContext();
  const resumed = context.resume();
  const source = context.createBufferSource(), active = playback = { context, source };
  controls(); status(tone === null ? 'Transmitiendo el mensaje. Mantené esta pantalla abierta.' : `Emitiendo el tono ${tone} durante 0,8 s.`);
  try {
    await resumed;
    if (playback !== active) return;
    let audio;
    if (tone === null) audio = synthesizeHigh(element('labMessage').value, { rate: context.sampleRate, band: currentBand() });
    else {
      const frequency = BANDS[currentBand()].tones[tone];
      if (frequency >= context.sampleRate / 2) throw Error('El dispositivo no admite este tono.');
      const samples = new Float32Array(Math.round(context.sampleRate * 0.8)), ramp = context.sampleRate * 0.03;
      for (let i = 0; i < samples.length; i++) {
        const envelope = Math.sin(Math.PI / 2 * Math.min(1, i / ramp, (samples.length - 1 - i) / ramp)) ** 2;
        samples[i] = 0.2 * envelope * Math.sin(2 * Math.PI * frequency * i / context.sampleRate);
      }
      audio = { samples, rate: context.sampleRate };
    }
    element('labRate').textContent = `Salida: ${context.sampleRate.toLocaleString('es-AR')} muestras/s`;
    source.buffer = context.createBuffer(1, audio.samples.length, audio.rate);
    source.buffer.getChannelData(0).set(audio.samples); source.connect(context.destination);
    source.onended = () => stopPlayback(true); source.start();
    if (navigator.wakeLock) {
      const lock = await navigator.wakeLock.request('screen').catch(() => null);
      if (playback === active) active.wakeLock = lock; else if (lock) void lock.release().catch(() => {});
    }
  } catch (error) { if (playback === active) { stopPlayback(); status(error.message, true); } }
}
function accept(samples, decoder) {
  for (const payload of decoder.push(samples)) {
    try {
      element('labResult').textContent = new TextDecoder('utf-8', { fatal: true }).decode(payload);
      status('Mensaje recuperado del audio y CRC correcto.');
    } catch { status('El contenido recibido no es texto UTF-8 válido.', true); }
  }
}
function closeCapture() {
  if (!capture) return;
  const previous = capture; capture = null; operation++;
  if (previous.node) {
    if (previous.node.port) previous.node.port.onmessage = null; else previous.node.onaudioprocess = null;
    previous.node.disconnect();
  }
  previous.stream?.getTracks().forEach(track => track.stop()); previous.filter?.disconnect(); previous.source?.disconnect();
  previous.decoder?.dispose(); void previous.context.close().catch(() => {});
  if (previous.wakeLock) void previous.wakeLock.release().catch(() => {});
  controls(); status('Micrófono detenido.');
}
async function listen() {
  if (capture) { closeCapture(); return; }
  if (busy || playback) return;
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { status('El micrófono necesita HTTPS o localhost. Abrí la versión de prueba en un origen seguro.', true); return; }
  const context = newAudioContext(), resumed = context.resume();
  const active = capture = { context }; controls(); status('Autorizá el micrófono.');
  // Handle rejection even while the permission dialog is still open.
  void resumed.catch(() => {});
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 }, video: false });
    if (capture !== active) { stream.getTracks().forEach(track => track.stop()); return; }
    active.stream = stream; await resumed;
    if (capture !== active) return;
    active.decoder = new HighFrequencyDecoder(context.sampleRate, currentBand());
    active.source = context.createMediaStreamSource(stream); active.filter = connectBandpass(context, active.source, currentBand());
    if (context.audioWorklet && window.AudioWorkletNode) {
      try {
        await context.audioWorklet.addModule('./capture-worklet.js');
        if (capture !== active) return;
        active.node = new AudioWorkletNode(context, 'sonic-capture', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 1, channelCountMode: 'explicit' });
        active.node.port.onmessage = event => { if (capture === active) accept(event.data, active.decoder); };
      } catch { active.node = null; }
    }
    if (capture !== active) return;
    if (!active.node) {
      active.node = context.createScriptProcessor(1024, 1, 1);
      active.node.onaudioprocess = event => { if (capture === active) accept(new Float32Array(event.inputBuffer.getChannelData(0)), active.decoder); event.outputBuffer.getChannelData(0).fill(0); };
    }
    active.filter.output.connect(active.node); active.node.connect(context.destination);
    const settings = stream.getAudioTracks()[0].getSettings();
    const processing = [settings.echoCancellation, settings.noiseSuppression, settings.autoGainControl].some(value => value === true);
    element('captureInfo').textContent = `Pasabanda activo · ${context.sampleRate.toLocaleString('es-AR')} muestras/s.` + (processing ? ' El navegador mantiene algún procesamiento automático; puede afectar los tonos.' : ' Buscando el preámbulo.');
    element('labRate').textContent = `Procesamiento: ${context.sampleRate.toLocaleString('es-AR')} muestras/s`;
    status('Escuchando. El otro teléfono puede probar los tonos o enviar un mensaje.');
    if (navigator.wakeLock) {
      const lock = await navigator.wakeLock.request('screen').catch(() => null);
      if (capture === active) active.wakeLock = lock; else if (lock) void lock.release().catch(() => {});
    }
  } catch (error) {
    if (capture !== active) return;
    closeCapture(); status(error.name === 'NotAllowedError' ? 'Habilitá el permiso de micrófono del sitio y repetí la prueba.' : `No se pudo activar el micrófono: ${error.message}`, true);
  }
}
async function digitalTest(file = null) {
  if (capture || playback || busy) return;
  busy = true; const current = ++operation; controls(); status(file ? 'Analizando el WAV localmente…' : 'Generando audio y comprobando la decodificación…');
  let context, decoder;
  try {
    let samples, rate;
    if (file) {
      if (file.size > 8 * 1024 * 1024) throw Error('Elegí un WAV de hasta 8 MB.');
      context = newAudioContext(); const decoded = await context.decodeAudioData(await file.arrayBuffer());
      if (decoded.duration > 30) throw Error('Esta prueba admite WAV de hasta 30 segundos.');
      samples = new Float32Array(decoded.length); rate = decoded.sampleRate;
      for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
        const data = decoded.getChannelData(channel);
        for (let i = 0; i < samples.length; i++) samples[i] += data[i] / decoded.numberOfChannels;
      }
    } else {
      const audio = synthesizeHigh(element('labMessage').value, { band: currentBand() }); samples = audio.samples; rate = audio.rate;
    }
    const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const offline = new Offline(1, samples.length, rate), source = offline.createBufferSource();
    source.buffer = offline.createBuffer(1, samples.length, rate); source.buffer.getChannelData(0).set(samples);
    connectBandpass(offline, source, currentBand()).output.connect(offline.destination); source.start();
    const filtered = (await offline.startRendering()).getChannelData(0);
    decoder = new HighFrequencyDecoder(rate, currentBand());
    for (let i = 0; i < filtered.length; i += 1024) {
      if (current !== operation) return;
      accept(filtered.subarray(i, i + 1024), decoder);
      if (i % 32768 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    if (!decoder.metrics.accepted) throw Error('No se encontró un mensaje válido para esta banda.');
    status(file ? 'WAV decodificado: mensaje recuperado y CRC correcto.' : 'Prueba digital correcta: PCM → pasabanda → Goertzel → texto + CRC. La prueba entre teléfonos verifica el canal físico.');
  } catch (error) { status(error.message, true); }
  finally { decoder?.dispose(); if (context) void context.close().catch(() => {}); busy = false; element('labAudioFile').value = ''; controls(); }
}
function updateMeters() {
  const metrics = capture?.decoder?.metrics;
  for (const [suffix, key] of [['Zero', 'zero'], ['One', 'one']]) {
    const db = Math.max(-100, Math.min(0, 10 * Math.log10(metrics?.[key] || 1e-10)));
    element(`power${suffix}`).value = db; element(`level${suffix}`).textContent = `${db.toFixed(0)} dBFS`;
  }
  element('syncStatus').textContent = metrics ? `${metrics.locked ? 'Preámbulo detectado · recibiendo' : 'Buscando preámbulo'} · ${metrics.accepted} válidos · ${metrics.rejected} rechazados` : 'Esperando el preámbulo';
  requestAnimationFrame(updateMeters);
}
element('band').onchange = describe; element('labMessage').oninput = describe;
element('labSend').onclick = () => void play(); element('labStopSend').onclick = () => stopPlayback();
element('toneZero').onclick = () => void play(0); element('toneOne').onclick = () => void play(1);
element('labListen').onclick = () => void listen(); element('labDigital').onclick = () => void digitalTest();
element('labAudioFile').onchange = event => { const file = event.target.files[0]; if (file) void digitalTest(file); };
element('labDownload').onclick = () => {
  const audio = synthesizeHigh(element('labMessage').value, { band: currentBand() });
  const url = URL.createObjectURL(new Blob([wavBytes(audio.samples, audio.rate)], { type: 'audio/wav' }));
  const link = document.createElement('a'); link.href = url; link.download = `sonicdrop-${currentBand()}.wav`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
};
document.addEventListener('visibilitychange', () => { if (document.hidden) { closeCapture(); stopPlayback(); } });
window.addEventListener('pagehide', () => { closeCapture(); stopPlayback(); });
describe(); updateMeters();
if ('serviceWorker' in navigator && window.isSecureContext) void navigator.serviceWorker.register('./sw.js').catch(() => {});
