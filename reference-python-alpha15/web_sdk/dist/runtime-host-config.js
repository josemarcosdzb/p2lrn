const state = {
  baseUrl: null,
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
    const error = new TypeError(`Invalid P2RLN runtime base URL: ${String(value)}`);
    error.code = 'P2RLN_RUNTIME_URL_INVALID';
    throw error;
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    const error = new TypeError('P2RLN runtime host must use http: or https:.');
    error.code = 'P2RLN_RUNTIME_URL_INVALID';
    throw error;
  }
  if (url.username || url.password || url.search || url.hash) {
    const error = new TypeError('P2RLN runtime base URL must not contain credentials, query parameters or a fragment.');
    error.code = 'P2RLN_RUNTIME_URL_INVALID';
    throw error;
  }
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url.href;
}

export function configureRuntimeHost(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('P2RLN runtime-host configuration must be an object.');
  }
  if (Object.prototype.hasOwnProperty.call(options, 'baseUrl')) {
    state.baseUrl = normalizeRuntimeBaseUrl(options.baseUrl);
  }
  return getRuntimeHostConfig();
}

export function getRuntimeHostConfig() {
  return Object.freeze({baseUrl: state.baseUrl});
}

export function resolveScormRuntimeUrl(explicitBaseUrl = null, {applicationOrigin = globalThis.location?.origin ?? null} = {}) {
  const baseUrl = normalizeRuntimeBaseUrl(explicitBaseUrl ?? state.baseUrl);
  if (!baseUrl) return null;
  const runtime = new URL('scorm/', baseUrl);
  if (applicationOrigin && applicationOrigin !== 'null' && runtime.origin === applicationOrigin) {
    const error = new Error(
      `SCORM runtime origin must be isolated from the embedding application. ` +
      `Application origin and runtime origin are both ${runtime.origin}.`,
    );
    error.code = 'P2RLN_SCORM_RUNTIME_ORIGIN_NOT_ISOLATED';
    throw error;
  }
  return runtime.href;
}


export function resolveH5pRuntimeUrl(explicitBaseUrl = null, {applicationOrigin = globalThis.location?.origin ?? null} = {}) {
  const baseUrl = normalizeRuntimeBaseUrl(explicitBaseUrl ?? state.baseUrl);
  if (!baseUrl) return null;
  const runtime = new URL('h5p/', baseUrl);
  if (applicationOrigin && applicationOrigin !== 'null' && runtime.origin === applicationOrigin) {
    const error = new Error(
      `H5P runtime origin must be isolated from the embedding application. ` +
      `Application origin and runtime origin are both ${runtime.origin}.`,
    );
    error.code = 'P2RLN_H5P_RUNTIME_ORIGIN_NOT_ISOLATED';
    throw error;
  }
  return runtime.href;
}
