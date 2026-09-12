import {
  P2LRN_WEB_SDK_VERSION,
  P2LRN_TOOLKIT_VERSION,
  P2LRN_CORE_VERSION,
  DEFAULT_LIMITS,
  P2LRNPlayerElement,
  defaultDependencyRegistry,
  defaultRendererRegistry,
  defaultComponentRegistry,
  mountP2LRN,
  openP2LRNPackageBytes,
  openP2LRNPackageURL,
} from './p2lrn-player.js';
import {createHostAdapter, HOST_ADAPTER_VERSION} from './host-adapter.js';
import {installP2LRNServiceWorker} from './static-resource-bridge.js';
import {configureRuntimeHost, getRuntimeHostConfig, normalizeRuntimeBaseUrl, resolveScormRuntimeUrl, resolveH5pRuntimeUrl} from './runtime-host-config.js';

export const version = P2LRN_WEB_SDK_VERSION;
export const toolkitVersion = P2LRN_TOOLKIT_VERSION;
export const coreVersion = P2LRN_CORE_VERSION;
export {
  DEFAULT_LIMITS,
  P2LRNPlayerElement,
  HOST_ADAPTER_VERSION,
  createHostAdapter,
  mountP2LRN,
  openP2LRNPackageBytes,
  openP2LRNPackageURL,
  installP2LRNServiceWorker,
  configureRuntimeHost,
  getRuntimeHostConfig,
  normalizeRuntimeBaseUrl,
  resolveScormRuntimeUrl,
  resolveH5pRuntimeUrl,
};

export const registerRenderer = (descriptor) => defaultRendererRegistry.register(descriptor);
export const unregisterRenderer = (id) => defaultRendererRegistry.unregister(id);
export const renderers = () => defaultRendererRegistry.list();
export const registerComponent = (descriptor) => defaultComponentRegistry.register(descriptor);
export const unregisterComponent = (id, componentVersion) => defaultComponentRegistry.unregister(id, componentVersion);
export const components = () => defaultComponentRegistry.list();
export const registerDependency = (descriptor) => defaultDependencyRegistry.register(descriptor);
export const dependencies = () => defaultDependencyRegistry.list();
export const setPermissionPolicy = (policy) => defaultRendererRegistry.setPermissionPolicy(policy);

export default globalThis.P2LRN;
