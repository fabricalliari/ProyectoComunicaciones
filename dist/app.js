import { crc32, Receiver, encodeImage, encodeText, decodeContent, splitTransfer } from './protocol.js';
import { StreamingDecoder, getEngine, synthesize, wavBytes, newAudioContext } from './audio.js';
const $ = id => document.getElementById(id);
let mode = 'send', kind = 'image', sourceImage, prepared, engine;
let generation = 0, sending = false, listening = false, importing = false;
let txContext, txSource, txAnalyser, rxContext, rxStream, rxNode, rxSource, rxAnalyser, rxDecoder;
let startedAt = 0, resultContent, wakeLock;
const receiver = new Receiver();
const timeLabel = value => value < 60 ? `${Math.ceil(value)} s` : `${Math.floor(value / 60)} min ${Math.ceil(value % 60)} s`;
function notify(text, error = false) {
  $('notice').textContent = text; $('signalTitle').textContent = error ? 'Revisá el enlace' : sending ? 'Emitiendo sonido' : listening ? 'Escuchando el micrófono' : importing ? 'Analizando el audio' : 'Listo para empezar';
  document.querySelector('.signal-card').classList.toggle('error', error);
  $('signalDot').classList.toggle('busy', sending || listening || importing);
}
function drawImage(canvas, content) {
  canvas.width = content.width; canvas.height = content.height;
  canvas.getContext('2d').putImageData(new ImageData(content.rgba, content.width, content.height), 0, 0);
}
function updateButtons() {
  $('transmitButton').disabled = !prepared || sending || importing;
  $('transmitButton').querySelector('span').textContent = sending ? 'Emitiendo sonido…' : prepared ? 'Transmitir por sonido' : 'Preparando el sonido…';
  $('downloadAudio').disabled = !prepared || sending;
  $('cancelSend').hidden = !sending;
  $('listenButton').disabled = importing || !engine;
  $('listenButton').querySelector('span').textContent = listening ? 'Detener micrófono' : 'Activar micrófono';
  $('imageFile').disabled = sending; $('quality').disabled = sending;
  $('message').disabled = sending; $('exampleButton').disabled = sending;
}
function setMode(next) {
  if (next === mode) return;
  stopSending(); stopListening(); mode = next;
  $('sendPanel').hidden = next !== 'send'; $('receivePanel').hidden = next !== 'receive';
  for (const name of ['send', 'receive']) { $(`${name}Tab`).classList.toggle('active', name === next); $(`${name}Tab`).setAttribute('aria-pressed', name === next); }
  notify(next === 'receive' ? 'Activá el micrófono antes de que el otro dispositivo emita el sonido.' : 'Revisá la miniatura y transmití cuando el receptor esté escuchando.');
}
function setKind(next) {
  if (sending) return;
  kind = next; $('imageInput').hidden = next !== 'image'; $('textInput').hidden = next !== 'text';
  $('sendImage').hidden = next !== 'image'; $('sendText').hidden = next !== 'text';
  for (const name of ['image', 'text']) { $(`${name}Kind`).classList.toggle('active', name === next); $(`${name}Kind`).setAttribute('aria-pressed', name === next); }
  prepare();
}
async function prepare() {
  const current = ++generation; prepared = null; updateButtons();
  try {
    let data, content;
    if (kind === 'image') {
      if (!sourceImage) return;
      const side = Number($('quality').value), ratio = Math.min(1, side / Math.max(sourceImage.width, sourceImage.height));
      const w = Math.max(1, Math.round(sourceImage.width * ratio)), h = Math.max(1, Math.round(sourceImage.height * ratio));
      const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
      const g = canvas.getContext('2d', { willReadFrequently: true });
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(sourceImage, 0, 0, w, h);
      const encoded = encodeImage(g.getImageData(0, 0, w, h).data, w, h);
      data = encoded.data; content = encoded.content; drawImage($('sendImage'), content);
    } else {
      const text = $('message').value, length = new TextEncoder().encode(text).length;
      $('textCount').textContent = `${length} / 400 bytes`; document.querySelector('.text-counter').classList.toggle('over-limit', length > 400);
      $('sendText').textContent = text || 'Tu mensaje aparecerá acá.';
      if (!text) { $('contentSize').textContent = 'Sin mensaje'; $('audioDuration').textContent = '—'; $('blockCount').textContent = '—'; return; }
      data = encodeText(text); content = decodeContent(data);
    }
    $('contentSize').textContent = `${data.length} bytes`; $('audioDuration').textContent = 'Calculando…';
    engine ||= await getEngine();
    if (current !== generation) return;
    const random = new Uint32Array(1); crypto.getRandomValues(random);
    const frames = splitTransfer(data, random[0]), audio = synthesize(engine, frames);
    prepared = { data, content, frames, audio, checksum: crc32(data) };
    $('audioDuration').textContent = timeLabel(audio.duration); $('blockCount').textContent = frames.length.toString();
    $('contentSize').title = content.type === 'image' ? `${content.width} × ${content.height} píxeles · ${content.colors} colores` : 'Mensaje UTF-8';
    notify(content.type === 'image' ? `Miniatura lista: ${content.width} × ${content.height} píxeles. Activá Recibir en el otro dispositivo.` : 'Mensaje listo. Activá Recibir en el otro dispositivo.');
  } catch (error) {
    if (current !== generation) return;
    $('audioDuration').textContent = '—'; $('blockCount').textContent = '—'; notify(error.message, true);
  } finally { if (current === generation) updateButtons(); }
}
function exampleImage() {
  const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 280;
  const g = canvas.getContext('2d');
  g.fillStyle = '#d9edf1'; g.fillRect(0, 0, 400, 280);
  g.fillStyle = '#f8c471'; g.beginPath(); g.arc(301, 60, 31, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#739eae'; g.beginPath(); g.moveTo(0, 161); g.lineTo(119, 51); g.lineTo(245, 159); g.lineTo(307, 99); g.lineTo(400, 166); g.closePath(); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(91, 77); g.lineTo(119, 51); g.lineTo(150, 78); g.lineTo(130, 74); g.lineTo(117, 87); g.lineTo(106, 74); g.closePath(); g.fill();
  g.fillStyle = '#487c82'; g.beginPath(); g.moveTo(0, 182); g.lineTo(90, 118); g.lineTo(183, 181); g.lineTo(263, 136); g.lineTo(400, 185); g.closePath(); g.fill();
  g.fillStyle = '#4ca6b4'; g.fillRect(0, 182, 400, 98);
  g.fillStyle = '#d7e6d7'; g.beginPath(); g.moveTo(0, 211); g.lineTo(113, 238); g.lineTo(262, 233); g.lineTo(400, 260); g.lineTo(400, 280); g.lineTo(0, 280); g.closePath(); g.fill();
  for (const [x, y, size] of [[28, 196, 31], [64, 216, 45], [345, 236, 29], [368, 226, 48]]) {
    g.fillStyle = '#256055'; g.beginPath(); g.moveTo(x, y - size); g.lineTo(x - size * .4, y); g.lineTo(x + size * .4, y); g.closePath(); g.fill();
    g.fillStyle = '#38534d'; g.fillRect(x - 2, y, 4, 9);
  }
  sourceImage = canvas; $('imageName').textContent = 'Paisaje de ejemplo'; $('imageFile').value = ''; prepare();
}
async function loadImage(file) {
  if (!file || sending) return;
  if (file.size > 20 * 1024 * 1024) { notify('Elegí una imagen de menos de 20 MB.', true); return; }
  const url = URL.createObjectURL(file), image = new Image();
  try {
    image.src = url; await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw Error('La imagen no se pudo abrir.');
    sourceImage = image; $('imageName').textContent = file.name; await prepare();
  } catch { notify('No se pudo abrir esa imagen. Probá exportarla como JPEG o PNG.', true); }
  finally { URL.revokeObjectURL(url); }
}
async function keepAwake() { try { if (navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen'); } catch { } }
function releaseWakeLock() { if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; } }
function stopSending(completed = false) {
  const wasSending = sending; sending = false;
  if (txSource) { txSource.onended = null; try { txSource.stop(); } catch { } txSource.disconnect(); txSource = null; }
  if (txContext) { txContext.close().catch(() => {}); txContext = null; }
  txAnalyser = null; releaseWakeLock(); $('sendTrack').hidden = true; $('sendProgressLabel').textContent = ''; updateButtons();
  if (wasSending) notify(completed ? 'Sonido emitido. Comprobá la recepción en el otro dispositivo; si faltan bloques, emití otra vez.' : 'Envío detenido. Podés volver a transmitir el mismo sonido.');
}
async function transmit() {
  if (!prepared || sending || importing) return;
  try {
    stopListening();
    // Resume directly in the tap handler, before awaiting, for Safari's user-gesture requirement.
    txContext = newAudioContext(); const resumed = txContext.resume();
    sending = true; updateButtons(); notify('El sonido contiene la miniatura o el mensaje. Mantené los dispositivos cerca.');
    await resumed;
    if (!sending || !txContext) return;
    const audio = prepared.audio, buffer = txContext.createBuffer(1, audio.samples.length, audio.rate);
    buffer.getChannelData(0).set(audio.samples);
    txSource = txContext.createBufferSource(); txSource.buffer = buffer;
    txAnalyser = txContext.createAnalyser(); txAnalyser.fftSize = 2048;
    txSource.connect(txAnalyser); txAnalyser.connect(txContext.destination);
    startedAt = txContext.currentTime; txSource.onended = () => stopSending(true);
    $('sendTrack').hidden = false; $('sendProgress').style.width = '0%'; txSource.start(); keepAwake();
  } catch (error) { stopSending(); notify('No se pudo reproducir: ' + error.message, true); }
}
function stopListening() {
  const wasListening = listening; listening = false;
  if (rxNode) { if (rxNode.port) rxNode.port.onmessage = null; else rxNode.onaudioprocess = null; rxNode.disconnect(); rxNode = null; }
  if (rxSource) { rxSource.disconnect(); rxSource = null; }
  if (rxStream) { rxStream.getTracks().forEach(track => track.stop()); rxStream = null; }
  if (rxContext) { rxContext.close().catch(() => {}); rxContext = null; }
  if (rxDecoder) { rxDecoder.dispose(); rxDecoder = null; }
  rxAnalyser = null; releaseWakeLock(); document.querySelector('.listen-illustration').classList.remove('listening');
  $('micStatus').textContent = 'El navegador te pedirá permiso. El audio se procesa acá.'; updateButtons();
  if (wasListening) notify('Micrófono detenido. Los bloques recibidos se conservan hasta limpiar la recepción.');
}
function acceptAudio(samples, decoder = rxDecoder) {
  if (decoder == null) return;
  for (const frame of decoder.push(samples)) handleFrame(frame);
}
function handleFrame(bytes) {
  const state = receiver.accept(bytes); if (state.ignored || state.duplicate) return;
  if (state.started) {
    resultContent = null; $('receivedPlaceholder').hidden = false; $('receivedImage').hidden = true; $('receivedText').hidden = true;
    $('saveImage').hidden = true; $('copyText').hidden = true; $('receivedStage').classList.add('waiting');
    $('receivedSubtitle').textContent = 'Reconstruyendo una nueva transferencia.';
  }
  if (state.error) { notify(state.error, true); $('receivedCheck').textContent = 'Verificación fallida'; return; }
  $('receivedCount').textContent = `${state.received} de ${state.count} bloques recibidos`;
  $('receiveProgress').style.width = `${state.received / state.count * 100}%`;
  if (state.complete) {
    try {
      resultContent = decodeContent(state.data); showReceived(resultContent);
      $('receivedCheck').textContent = 'Contenido verificado ✓'; $('receivedCheck').classList.add('good');
      notify('¡Llegó! El contenido completo pasó la verificación. Ya podés guardarlo.');
    } catch (error) { notify(error.message, true); }
  } else {
    $('receivedCheck').textContent = 'Recibiendo…'; $('receivedCheck').classList.remove('good');
    notify(`Recibidos ${state.received} de ${state.count} bloques. Si al terminar falta alguno, volvé a emitir el mismo sonido.`);
  }
}
function showReceived(content) {
  $('receivedPlaceholder').hidden = true; $('receivedStage').classList.remove('waiting');
  $('receivedImage').hidden = content.type !== 'image'; $('receivedText').hidden = content.type !== 'text';
  $('saveImage').hidden = content.type !== 'image'; $('copyText').hidden = content.type !== 'text';
  if (content.type === 'image') {
    drawImage($('receivedImage'), content);
    $('receivedSubtitle').textContent = `Miniatura reconstruida · ${content.width} × ${content.height} píxeles · ${content.colors} colores`;
  } else { $('receivedText').textContent = content.text; $('receivedSubtitle').textContent = 'Mensaje reconstruido a partir del sonido.'; }
}
function resetReceiver() {
  receiver.reset(); resultContent = null; $('receivedPlaceholder').hidden = false;
  $('receivedImage').hidden = true; $('receivedText').hidden = true; $('saveImage').hidden = true; $('copyText').hidden = true;
  $('receivedStage').classList.add('waiting'); $('receivedSubtitle').textContent = 'Esperando una imagen o un mensaje.';
  $('receivedCount').textContent = '0 bloques recibidos'; $('receivedCheck').textContent = 'Sin transferencia'; $('receivedCheck').classList.remove('good'); $('receiveProgress').style.width = '0%';
  notify(listening ? 'Recepción limpia. El micrófono sigue escuchando.' : 'Recepción limpia. Activá el micrófono para empezar.');
}
async function listen() {
  if (listening) { stopListening(); return; }
  if (!engine || importing) return;
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { notify('Para usar el micrófono, abrí la web por HTTPS en Safari actualizado.', true); return; }
  try {
    rxContext = newAudioContext(); const resumed = rxContext.resume();
    listening = true; updateButtons(); notify('Autorizá el micrófono cuando el navegador lo solicite.');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 }, video: false });
    if (!listening) { stream.getTracks().forEach(track => track.stop()); return; }
    rxStream = stream; await resumed;
    rxDecoder = new StreamingDecoder(engine, rxContext.sampleRate);
    rxSource = rxContext.createMediaStreamSource(stream); rxAnalyser = rxContext.createAnalyser(); rxAnalyser.fftSize = 2048;
    rxSource.connect(rxAnalyser);
    if (rxContext.audioWorklet && window.AudioWorkletNode) {
      try {
        await rxContext.audioWorklet.addModule('./capture-worklet.js');
        if (!listening || !rxContext) return;
        rxNode = new AudioWorkletNode(rxContext, 'sonic-capture', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 1, channelCountMode: 'explicit' });
        rxNode.port.onmessage = event => { if (listening) acceptAudio(event.data); };
      } catch { rxNode = null; }
    }
    if (!rxNode) {
      rxNode = rxContext.createScriptProcessor(1024, 1, 1);
      rxNode.onaudioprocess = event => { if (listening) acceptAudio(new Float32Array(event.inputBuffer.getChannelData(0))); event.outputBuffer.getChannelData(0).fill(0); };
    }
    rxSource.connect(rxNode); rxNode.connect(rxContext.destination);
    document.querySelector('.listen-illustration').classList.add('listening'); $('micStatus').textContent = 'Micrófono activo. El otro dispositivo ya puede transmitir.';
    notify('Escuchando. Mantené esta pantalla abierta mientras el otro dispositivo emite.'); keepAwake();
  } catch (error) {
    stopListening(); const denied = ['NotAllowedError', 'PermissionDeniedError'].includes(error.name);
    notify(denied ? 'No se habilitó el micrófono. Revisá el permiso del sitio en Safari y volvé a intentarlo.' : 'No se pudo activar el micrófono: ' + error.message, true);
  }
}
async function importAudio(file) {
  if (!file || importing || sending) return;
  if (file.size > 32 * 1024 * 1024) { notify('Elegí un audio WAV de menos de 32 MB.', true); return; }
  stopListening(); resetReceiver(); importing = true; updateButtons();
  let context, decoder;
  try {
    context = newAudioContext(); void context.resume().catch(() => {});
    notify('Analizando el sonido guardado. El contenido se reconstruye localmente.');
    const decoded = await context.decodeAudioData(await file.arrayBuffer());
    if (decoded.duration > 600) throw Error('El audio es demasiado largo para esta prueba.');
    decoder = new StreamingDecoder(engine, context.sampleRate);
    const mono = new Float32Array(decoded.length);
    for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
      const data = decoded.getChannelData(channel); for (let i = 0; i < data.length; i++) mono[i] += data[i] / decoded.numberOfChannels;
    }
    for (let offset = 0; offset < mono.length; offset += 1024) {
      acceptAudio(mono.subarray(offset, Math.min(offset + 1024, mono.length)), decoder);
      if (offset % (1024 * 32) === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    if (!resultContent) notify(receiver.active ? 'Faltan bloques en este audio. Podés completar la recepción emitiendo el sonido otra vez.' : 'No se encontró una transferencia SonicDrop. Elegí un WAV generado por esta web.', true);
    else notify('Contenido reconstruido y verificado a partir del audio WAV.');
  } catch (error) { notify('No se pudo analizar el audio: ' + error.message, true); }
  finally {
    if (decoder) decoder.dispose(); if (context) context.close().catch(() => {});
    importing = false; updateButtons(); $('audioFile').value = ''; $('signalDot').classList.remove('busy');
    $('signalTitle').textContent = document.querySelector('.signal-card').classList.contains('error') ? 'Revisá el enlace' : 'Listo para empezar';
  }
}
function download(blob, filename) {
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function drawWave() {
  const canvas = $('waveform'), g = canvas.getContext('2d'); g.clearRect(0, 0, canvas.width, canvas.height);
  const analyser = txAnalyser || rxAnalyser;
  g.strokeStyle = '#78d7c1'; g.lineWidth = 1.6; g.beginPath();
  if (analyser) {
    const values = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(values);
    for (let i = 0; i < canvas.width; i++) { const y = 45 + values[Math.floor(i / canvas.width * values.length)] * 100; if (!i) g.moveTo(i, y); else g.lineTo(i, y); }
  } else { g.moveTo(0, 45); g.lineTo(canvas.width, 45); }
  g.stroke();
  if (sending && txContext && prepared) {
    const elapsed = txContext.currentTime - startedAt, progress = Math.min(1, elapsed / prepared.audio.duration);
    $('sendProgress').style.width = `${progress * 100}%`; $('sendProgressLabel').textContent = `${Math.floor(progress * 100)}% · ${timeLabel(Math.max(0, prepared.audio.duration - elapsed))}`;
  }
  requestAnimationFrame(drawWave);
}
async function prepareOffline() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) { $('offlineStatus').textContent = 'Primera carga con conexión'; return; }
  try {
    await navigator.serviceWorker.register('./sw.js'); await navigator.serviceWorker.ready;
    $('offlineStatus').textContent = 'Recursos guardados · disponible sin conexión';
  } catch { $('offlineStatus').textContent = 'Acceso offline no preparado'; }
}
$('sendTab').onclick = () => setMode('send'); $('receiveTab').onclick = () => setMode('receive');
$('imageKind').onclick = () => setKind('image'); $('textKind').onclick = () => setKind('text');
$('quality').onchange = prepare; $('message').oninput = prepare; $('imageFile').onchange = event => loadImage(event.target.files[0]);
$('exampleButton').onclick = exampleImage; $('transmitButton').onclick = transmit; $('cancelSend').onclick = () => stopSending();
$('listenButton').onclick = listen; $('resetReceiver').onclick = resetReceiver; $('audioFile').onchange = event => importAudio(event.target.files[0]);
$('downloadAudio').onclick = () => { if (prepared) download(new Blob([wavBytes(prepared.audio.samples, prepared.audio.rate)], { type: 'audio/wav' }), 'sonicdrop-transferencia.wav'); };
$('saveImage').onclick = () => $('receivedImage').toBlob(blob => { if (blob) download(blob, 'sonicdrop-imagen.png'); }, 'image/png');
$('copyText').onclick = async () => {
  if (resultContent?.type !== 'text') return;
  try { await navigator.clipboard.writeText(resultContent.text); notify('Mensaje copiado.'); }
  catch { notify('No se pudo copiar automáticamente. Seleccioná el mensaje y usá Copiar.'); }
};
$('helpButton').onclick = () => $('helpDialog').showModal(); $('closeHelp').onclick = $('helpDone').onclick = () => $('helpDialog').close();
$('dropZone').ondragover = event => { event.preventDefault(); $('dropZone').classList.add('dragging'); };
$('dropZone').ondragleave = () => $('dropZone').classList.remove('dragging');
$('dropZone').ondrop = event => { event.preventDefault(); $('dropZone').classList.remove('dragging'); loadImage(event.dataTransfer.files[0]); };
document.addEventListener('visibilitychange', () => {
  if (document.hidden && (sending || listening)) { stopSending(); stopListening(); notify('El enlace se detuvo al salir de la pantalla. Volvé a activar Recibir o a emitir el sonido.'); }
});
window.addEventListener('pagehide', () => { stopSending(); stopListening(); });
getEngine().then(module => { engine = module; updateButtons(); }).catch(error => notify('No se pudo cargar el motor de audio: ' + error.message, true));
exampleImage(); drawWave(); prepareOffline();
