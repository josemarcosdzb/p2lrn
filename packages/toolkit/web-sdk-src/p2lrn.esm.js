import {
  P2LRN_WEB_SDK_VERSION,
  P2LRN_TOOLKIT_VERSION,
  P2LRN_CORE_VERSION,
  DEFAULT_LIMITS,
  P2LRNPlayerElement,
  create3DAuthoringScene,
  defaultDependencyRegistry,
  defaultRendererRegistry,
  defaultComponentRegistry,
  mountP2LRN,
  openP2LRNPackageBytes,
  openP2LRNPackageURL,
  cacheP2LRNPackageURL,
  openCachedP2LRNPackage,
} from './p2lrn-player.js';
import {negotiateP2LRNExecution,inspectP2LRNPackageExecution,P2LRN_EXECUTION_PLAN_SCHEMA,P2LRN_EXECUTION_PLAN_VERSION} from './execution-negotiation.js';
import {createHostAdapter, HOST_ADAPTER_VERSION} from './host-adapter.js';
import {createResultRecorder} from './result-recorder.js';
import {createPlayerAnalyticsSession,createHttpResultHost,P2LRN_RESULT_HOST_VERSION} from './result-bridge.js';
import {CapabilityBroker, createCapabilityBroker, createToolCapabilityProvider, createMcpCapabilityProvider, capabilityRequirements, mergeCapabilityRequirements, capabilityOperationAllowed, projectCapabilityContext, validateCapabilityGraph, HOST_CAPABILITY_EXTENSION, HOST_CAPABILITY_CONTRACT_VERSION} from './capability-broker.js';
import {createOfflineHostAdapter, createMemoryOfflineStore, createIndexedDbOfflineStore, createOfflineSyncController, OFFLINE_HOST_ADAPTER_VERSION, DEFAULT_OFFLINE_DB_NAME} from './offline-host-adapter.js';
import {createActivityTracker, DEFAULT_ACTIVITY_IDLE_AFTER_MS} from './activity-tracker.js';
import {createLearningEvent, createLearningEventStream, observeLearningEvents, isLearningEvent, learningEventCategory, LEARNING_EVENT_SCHEMA, LEARNING_EVENT_MODEL_VERSION, LEARNING_RUNTIME_EVENT_TYPES, LEARNING_EVENT_CATEGORIES} from './learning-events.js';
import {createMemoryResourceLibrary, createCacheStorageResourceLibrary, createResourceLibraryResolver, createResourceLibraryCapabilityProvider, verifyResourceBytes, RESOURCE_LIBRARY_VERSION, RESOURCE_LIBRARY_CAPABILITY_ID, DEFAULT_RESOURCE_LIBRARY_CACHE, DEFAULT_RESOURCE_LIBRARY_MAX_BYTES} from './resource-library.js';
import {createMemoryCollaborationHub, COLLABORATION_CAPABILITY, COLLABORATION_OPERATIONS} from './collaboration-provider.js';
import {createHttpCollaborationProvider, COLLABORATION_HTTP_VERSION, COLLABORATION_HTTP_MEDIA_TYPE} from './collaboration-http-provider.js';
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
  create3DAuthoringScene,
  HOST_ADAPTER_VERSION,
  createHostAdapter,
  createResultRecorder,
  createPlayerAnalyticsSession,
  createHttpResultHost,
  P2LRN_RESULT_HOST_VERSION,
  CapabilityBroker,
  createCapabilityBroker,
  createToolCapabilityProvider,
  createMcpCapabilityProvider,
  capabilityRequirements,
  mergeCapabilityRequirements,
  capabilityOperationAllowed,
  projectCapabilityContext,
  validateCapabilityGraph,
  HOST_CAPABILITY_EXTENSION,
  HOST_CAPABILITY_CONTRACT_VERSION,
  createOfflineHostAdapter,
  createMemoryOfflineStore,
  createIndexedDbOfflineStore,
  createOfflineSyncController,
  OFFLINE_HOST_ADAPTER_VERSION,
  DEFAULT_OFFLINE_DB_NAME,
  createActivityTracker,
  DEFAULT_ACTIVITY_IDLE_AFTER_MS,
  createLearningEvent,
  createLearningEventStream,
  observeLearningEvents,
  isLearningEvent,
  learningEventCategory,
  LEARNING_EVENT_SCHEMA,
  LEARNING_EVENT_MODEL_VERSION,
  LEARNING_RUNTIME_EVENT_TYPES,
  LEARNING_EVENT_CATEGORIES,
  createMemoryResourceLibrary,
  createCacheStorageResourceLibrary,
  createResourceLibraryResolver,
  createResourceLibraryCapabilityProvider,
  verifyResourceBytes,
  RESOURCE_LIBRARY_VERSION,
  RESOURCE_LIBRARY_CAPABILITY_ID,
  DEFAULT_RESOURCE_LIBRARY_CACHE,
  DEFAULT_RESOURCE_LIBRARY_MAX_BYTES,
  createMemoryCollaborationHub,
  createHttpCollaborationProvider,
  COLLABORATION_CAPABILITY,
  COLLABORATION_OPERATIONS,
  COLLABORATION_HTTP_VERSION,
  COLLABORATION_HTTP_MEDIA_TYPE,
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
export const negotiateExecution = (options = {}) => negotiateP2LRNExecution({...options,registry:defaultRendererRegistry});
export const inspectPackageExecution = (pkg,options = {}) => inspectP2LRNPackageExecution(pkg,{...options,registry:defaultRendererRegistry});
export const executionPlanSchema = P2LRN_EXECUTION_PLAN_SCHEMA;
export const executionPlanVersion = P2LRN_EXECUTION_PLAN_VERSION;
export const registerComponent = (descriptor) => defaultComponentRegistry.register(descriptor);
export const unregisterComponent = (id, componentVersion) => defaultComponentRegistry.unregister(id, componentVersion);
export const components = () => defaultComponentRegistry.list();
export const registerDependency = (descriptor) => defaultDependencyRegistry.register(descriptor);
export const dependencies = () => defaultDependencyRegistry.list();
export const setPermissionPolicy = (policy) => defaultRendererRegistry.setPermissionPolicy(policy);

export default globalThis.P2LRN;
