const PROTOCOL = 'p2lrn-h5p-runtime/1';
const LEGACY_PROTOCOL = 'p2rln-h5p-runtime/1';
const stage = document.getElementById('h5p-stage');
const errorBox = document.getElementById('h5p-error');
let port = null;
let player = null;
let h5pWindow = null;
let xapiHandler = null;
let activeProtocol = PROTOCOL;
const MAX_STATE_JSON_BYTES = 2 * 1024 * 1024;
const MAX_XAPI_JSON_BYTES = 1024 * 1024;
const encoder = new TextEncoder();

function send(action, payload = {}) { if (port) port.postMessage({protocol:activeProtocol, action, ...payload}); }
function boundedJson(value, label, maxBytes) {
  const text = JSON.stringify(value);
  if (text == null) return null;
  const bytes = encoder.encode(text).byteLength;
  if (bytes > maxBytes) { const error = new Error(`${label} exceeds ${maxBytes} UTF-8 bytes.`); error.code = 'P2LRN_H5P_RUNTIME_PAYLOAD_TOO_LARGE'; throw error; }
  return JSON.parse(text);
}
function softError(phase, error) { send('error', {phase, error:String(error?.message ?? error)}); }
function fail(error) {
  const message = String(error?.message ?? error ?? 'H5P runtime error');
  if (errorBox) { errorBox.hidden = false; errorBox.textContent = message; }
  send('error', {error:message});
}
function stateSnapshot() {
  try {
    const instance = h5pWindow?.H5P?.instances?.[0] ?? globalThis.H5P?.instances?.[0];
    if (!instance || typeof instance.getCurrentState !== 'function') return null;
    return boundedJson(instance.getCurrentState(), 'H5P state', MAX_STATE_JSON_BYTES);
  } catch (error) { softError('state-snapshot', error); return null; }
}
function emitState(reason) { const state = stateSnapshot(); if (state != null) send('state', {state, reason}); }
function resize() {
  try {
    const doc = h5pWindow?.document ?? document;
    const height = Math.max(doc.documentElement?.scrollHeight ?? 0, doc.body?.scrollHeight ?? 0, 100);
    send('resize', {height});
  } catch {}
}
async function initialize(data) {
  if (!globalThis.H5PStandalone?.H5P) throw new Error('H5P Standalone runtime assets are unavailable.');
  const previousState = data.previousState == null ? null : boundedJson(data.previousState, 'Previous H5P state', MAX_STATE_JSON_BYTES);
  const prior = previousState == null ? undefined : [{dataType:'state', previousState:JSON.stringify(previousState), subContentId:'*'}];
  const options = {
    id:'p2lrn-h5p',
    title:String(data.title ?? ''),
    h5pJsonPath:String(data.sessionUrl).replace(/\/$/, ''),
    contentJsonPath:String(data.contentUrl).replace(/\/$/, ''),
    librariesPath:String(data.librariesUrl).replace(/\/$/, ''),
    frameJs:new URL('frame.bundle.js', data.runtimeAssetsUrl).href,
    frameCss:new URL('styles/h5p.css', data.runtimeAssetsUrl).href,
    contentUserData:prior,
    xAPIObjectIRI:String(data.xAPIObjectIRI ?? ''),
    embedType:data.embedType === 'div' ? 'div' : 'iframe',
    fullScreen:true,
    frame:false,
    copyright:false,
    export:false,
    embed:false,
    icon:false,
    saveFreq:false,
  };
  player = await new globalThis.H5PStandalone.H5P(stage, options);
  const iframe = stage.querySelector('iframe.h5p-iframe');
  h5pWindow = iframe?.contentWindow ?? globalThis;
  const dispatcher = h5pWindow?.H5P?.externalDispatcher ?? globalThis.H5P?.externalDispatcher;
  if (dispatcher?.on) {
    xapiHandler = (event) => {
      const source = event?.data?.statement ?? event?.statement ?? event?.data ?? null;
      if (source) {
        try { const statement = boundedJson(source, 'H5P xAPI statement', MAX_XAPI_JSON_BYTES); if (statement) send('xapi', {statement}); }
        catch (error) { softError('xapi', error); }
      }
      emitState('xapi');
      queueMicrotask(resize);
    };
    dispatcher.on('xAPI', xapiHandler);
  }
  const ro = globalThis.ResizeObserver ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(stage);
  setTimeout(resize, 0);
  send('ready', {mainLibrary:data.mainLibrary ?? null});
}
function onPortMessage(event) {
  const data = event.data;
  if (!data || data.protocol !== activeProtocol) return;
  if (data.action === 'init') initialize(data).catch(fail);
  if (data.action === 'flush') emitState('flush');
}
window.addEventListener('beforeunload', () => emitState('unload'));
window.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || ![PROTOCOL, LEGACY_PROTOCOL].includes(data.protocol) || data.action !== 'connect' || !event.ports?.[0] || port) return;
  activeProtocol = data.protocol;
  port = event.ports[0];
  port.onmessage = onPortMessage;
  port.start?.();
  send('connected');
});
parent.postMessage({protocol:PROTOCOL, action:'shell-ready'}, '*');
parent.postMessage({protocol:LEGACY_PROTOCOL, action:'shell-ready'}, '*');
