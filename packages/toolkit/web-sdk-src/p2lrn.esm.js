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
  cacheP2LRNPackageURL,
  openCachedP2LRNPackage,
} from './p2lrn-player.js';
import {createHostAdapter, HOST_ADAPTER_VERSION} from './host-adapter.js';
import {CapabilityBroker, createCapabilityBroker, createToolCapabilityProvider, capabilityRequirements, mergeCapabilityRequirements, capabilityOperationAllowed, validateCapabilityGraph, HOST_CAPABILITY_EXTENSION, HOST_CAPABILITY_CONTRACT_VERSION} from './capability-broker.js';
import {createOfflineHostAdapter, createMemoryOfflineStore, createIndexedDbOfflineStore, OFFLINE_HOST_ADAPTER_VERSION, DEFAULT_OFFLINE_DB_NAME} from './offline-host-adapter.js';
import {createActivityTracker, DEFAULT_ACTIVITY_IDLE_AFTER_MS} from './activity-tracker.js';
import {createMemoryCollaborationHub, COLLABORATION_CAPABILITY, COLLABORATION_OPERATIONS} from './collaboration-provider.js';
import {createMemorySharedResourceStore} from './shared-resource-store.js';
import {createMemoryPackageCache, createCacheStoragePackageCache, createPackageCacheFetch, DEFAULT_PACKAGE_CACHE_NAME, PACKAGE_CACHE_VERSION} from './package-cache.js';
import {installP2LRNServiceWorker} from './static-resource-bridge.js';
import {configureRuntimeHost, getRuntimeHostConfig, normalizeRuntimeBaseUrl, resolveScormRuntimeUrl, resolveH5pRuntimeUrl, resolvePackageRuntimeUrl} from './runtime-host-config.js';
import {PROGRESSION_PROFILE, normalizeProgressionState} from './progression-core.js';


function ensureLegacyPlayerElement() {
  if (!globalThis.customElements) return;
  const existing = globalThis.customElements.get('p2rln-player');
  if (existing) {
    if (existing.p2lrnVersion !== P2LRN_WEB_SDK_VERSION) {
      const error = new Error(`P2LRN version conflict on legacy custom element p2rln-player: this runtime is ${P2LRN_WEB_SDK_VERSION}, found ${existing.p2lrnVersion ?? 'an unversioned runtime'}.`);
      error.code = 'P2LRN_VERSION_CONFLICT';
      throw error;
    }
    return;
  }
  // The Custom Elements registry cannot register the same constructor under two names.
  class LegacyP2RLNPlayerElement extends P2LRNPlayerElement {}
  globalThis.customElements.define('p2rln-player', LegacyP2RLNPlayerElement);
}

ensureLegacyPlayerElement();

export const version = P2LRN_WEB_SDK_VERSION;
export const toolkitVersion = P2LRN_TOOLKIT_VERSION;
export const coreVersion = P2LRN_CORE_VERSION;
export {
  DEFAULT_LIMITS,
  P2LRNPlayerElement,
  HOST_ADAPTER_VERSION,
  createHostAdapter,
  CapabilityBroker,
  createCapabilityBroker,
  createToolCapabilityProvider,
  capabilityRequirements,
  mergeCapabilityRequirements,
  capabilityOperationAllowed,
  validateCapabilityGraph,
  HOST_CAPABILITY_EXTENSION,
  HOST_CAPABILITY_CONTRACT_VERSION,
  createOfflineHostAdapter,
  createMemoryOfflineStore,
  createIndexedDbOfflineStore,
  OFFLINE_HOST_ADAPTER_VERSION,
  DEFAULT_OFFLINE_DB_NAME,
  createActivityTracker,
  DEFAULT_ACTIVITY_IDLE_AFTER_MS,
  createMemoryCollaborationHub,
  COLLABORATION_CAPABILITY,
  COLLABORATION_OPERATIONS,
  createMemorySharedResourceStore,
  createMemoryPackageCache,
  createCacheStoragePackageCache,
  createPackageCacheFetch,
  DEFAULT_PACKAGE_CACHE_NAME,
  PACKAGE_CACHE_VERSION,
  cacheP2LRNPackageURL,
  openCachedP2LRNPackage,
  mountP2LRN,
  openP2LRNPackageBytes,
  openP2LRNPackageURL,
  installP2LRNServiceWorker,
  configureRuntimeHost,
  getRuntimeHostConfig,
  normalizeRuntimeBaseUrl,
  resolveScormRuntimeUrl,
  resolveH5pRuntimeUrl,
  resolvePackageRuntimeUrl,
  PROGRESSION_PROFILE,
  normalizeProgressionState,
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
