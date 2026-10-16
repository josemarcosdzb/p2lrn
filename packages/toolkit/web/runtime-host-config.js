// Do not let bundlers turn this runtime folder URL into a compile-time module import.
const moduleHref = import.meta.url;
const DEFAULT_STATIC_BASE_URL = new URL('./runtime-host/', moduleHref).href;

const state = {
  baseUrl: DEFAULT_STATIC_BASE_URL,
  mode: 'static',
};

function browserBaseUrl() {
  const href = globalThis.location?.href;
  return href && typeof href === 'string' ? href : 'http://127.0.0.1/';
}

export function normalizeRuntimeBaseUrl(value, {baseUrl = browserBaseUrl()} = {}) {
  if (value == null || String(value).trim() === '') return null;
  let url;
  try {
    url = new URL(String(value), baseUrl);
  } catch {
    const error = new TypeError(`Invalid P2LRN runtime base URL: ${String(value)}`);
    error.code = 'P2LRN_RUNTIME_URL_INVALID';
    throw error;
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    const error = new TypeError('P2LRN runtime host must use http: or https:.');
    error.code = 'P2LRN_RUNTIME_URL_INVALID';
    throw error;
  }
  const localHttp = url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if (url.protocol === 'http:' && !localHttp) {
    const error = new TypeError('P2LRN runtime host requires HTTPS outside local development.');
    error.code = 'P2LRN_RUNTIME_INSECURE_TRANSPORT';
    throw error;
  }
  if (url.username || url.password || url.search || url.hash) {
    const error = new TypeError('P2LRN runtime base URL must not contain credentials, query parameters or a fragment.');
    error.code = 'P2LRN_RUNTIME_URL_INVALID';
    throw error;
  }
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url.href;
}

function inferMode(baseUrl) {
  if (!baseUrl) return null;
  try {
    const url = new URL(baseUrl);
    return /\/runtime-host\/$/u.test(url.pathname) ? 'static' : 'server';
  } catch {
    return 'server';
  }
}

export function configureRuntimeHost(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('P2LRN runtime-host configuration must be an object.');
  }
  if (Object.prototype.hasOwnProperty.call(options, 'baseUrl')) {
    state.baseUrl = normalizeRuntimeBaseUrl(options.baseUrl);
    state.mode = options.mode ?? inferMode(state.baseUrl);
  } else if (Object.prototype.hasOwnProperty.call(options, 'mode')) {
    state.mode = options.mode;
  }
  if (state.mode != null && !['static', 'server'].includes(state.mode)) {
    throw new TypeError('P2LRN runtime-host mode must be "static" or "server".');
  }
  return getRuntimeHostConfig();
}

export function getRuntimeHostConfig() {
  return Object.freeze({baseUrl: state.baseUrl, mode: state.mode});
}

function resolveRuntimeUrl(kind, explicitBaseUrl, {applicationOrigin = globalThis.location?.origin ?? null} = {}) {
  const configured = explicitBaseUrl == null
    ? {baseUrl: state.baseUrl, mode: state.mode}
    : {baseUrl: normalizeRuntimeBaseUrl(explicitBaseUrl), mode: inferMode(normalizeRuntimeBaseUrl(explicitBaseUrl))};
  const baseUrl = configured.baseUrl;
  if (!baseUrl) return null;
  const runtime = configured.mode === 'static'
    ? new URL(`${kind}.html`, baseUrl)
    : new URL(`${kind}/`, baseUrl);
  if (applicationOrigin && applicationOrigin !== 'null' && runtime.origin === applicationOrigin) {
    const label = kind === 'h5p' ? 'H5P' : kind === 'scorm' ? 'SCORM' : 'External package';
    const error = new Error(
      `${label} runtime origin must be isolated from the embedding application. ` +
      `Application origin and runtime origin are both ${runtime.origin}.`,
    );
    error.code = `P2LRN_${kind.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_RUNTIME_ORIGIN_NOT_ISOLATED`;
    throw error;
  }
  return runtime.href;
}

export function resolveScormRuntimeUrl(explicitBaseUrl = null, options = {}) {
  return resolveRuntimeUrl('scorm', explicitBaseUrl, options);
}

export function resolveH5pRuntimeUrl(explicitBaseUrl = null, options = {}) {
  return resolveRuntimeUrl('h5p', explicitBaseUrl, options);
}

export function resolvePackageRuntimeUrl(explicitBaseUrl = null, options = {}) {
  return resolveRuntimeUrl('package', explicitBaseUrl, options);
}
