const NATIVE_QUESTIONNAIRE_PROFILE = 'https://p2lrn.org/profile/native-questionnaire';
const NATIVE_COMPOSITE_PROFILE = 'https://p2lrn.org/profile/native-composite';
const NATIVE_COMPONENT_PROFILE = 'https://p2lrn.org/profile/native-component';
const NATIVE_QUESTIONNAIRE_MEDIA_TYPE = 'application/vnd.p2lrn.questionnaire+json';
const NATIVE_COMPOSITE_MEDIA_TYPE = 'application/vnd.p2lrn.composite+json';
const NATIVE_COMPONENT_MEDIA_TYPE = 'application/vnd.p2lrn.component+json';
import {DOM_DEPENDENCY, WEBGL2_DEPENDENCY} from './dependency-registry.js';
import {supportsPackageRuntime} from './renderers/package-runtime.js';
import {
  COMPOSITE_RENDERER,
  COMPONENT_ROUTER_RENDERER,
  CALLOUT_COMPONENT_RENDERER,
  TIMELINE_COMPONENT_RENDERER,
  CAPABILITY_ACTION_COMPONENT_RENDERER,
  COLLABORATION_COMPONENT_RENDERER,
  STANDARD_QUESTIONNAIRE_RENDERER,
  MEMORY_RENDERER,
  MATCHING_RENDERER,
  ORDERING_RENDERER,
  CLASSIFICATION_RENDERER,
  TRUE_FALSE_RENDERER,
  FILL_BLANKS_RENDERER,
  WORD_SEARCH_RENDERER,
  CROSSWORD_RENDERER,
  ROSCO_RENDERER,
  THREE_D_RENDERER,
  REMOTE_MEDIA_RENDERER,
} from './renderer-registry.js';

export const SCORM_RUNTIME_RENDERER = 'https://p2lrn.org/renderer/scorm/runtime';
export const H5P_RUNTIME_RENDERER = 'https://p2lrn.org/renderer/h5p/runtime';
export const PACKAGE_RUNTIME_RENDERER = 'https://p2lrn.org/renderer/package/runtime';
export const QTI_RUNTIME_RENDERER = 'https://p2lrn.org/renderer/qti/runtime';
export const PASSIVE_MEDIA_RENDERER = 'https://p2lrn.org/renderer/passive/media';
export const PASSIVE_TEXT_RENDERER = 'https://p2lrn.org/renderer/passive/text';

const questionnaire = {
  profiles: [NATIVE_QUESTIONNAIRE_PROFILE],
  mediaTypes: [NATIVE_QUESTIONNAIRE_MEDIA_TYPE],
  roles: [],
  dependencies: [DOM_DEPENDENCY],
};

export function registerBuiltInRenderers(registry) {
  registry.register({
    id: H5P_RUNTIME_RENDERER, version: '1', priority: 112, presentation: 'external-runtime',
    profiles: ['https://p2lrn.org/profile/h5p'], mediaTypes: ['application/zip', 'application/vnd.h5p', 'application/octet-stream'],
    dependencies: [DOM_DEPENDENCY],
    supports: ({representation}) => representation?.location?.type === 'embedded',
    load: () => import('./renderers/h5p-runtime.js'),
  });
  registry.register({
    id: SCORM_RUNTIME_RENDERER, version: '1', priority: 110, presentation: 'external-runtime',
    profiles: ['https://p2lrn.org/profile/scorm'], mediaTypes: ['text/html', 'application/xhtml+xml', 'application/zip'],
    dependencies: [DOM_DEPENDENCY],
    supports: ({representation}) => ['embedded', 'package-member'].includes(representation?.location?.type),
    load: () => import('./renderers/scorm-runtime.js'),
  });
  registry.register({
    id: PACKAGE_RUNTIME_RENDERER, version: '1', priority: 108, presentation: 'external-runtime',
    profiles: [
      'https://p2lrn.org/profile/cmi5',
      'https://p2lrn.org/profile/tincan-package',
      'https://p2lrn.org/profile/common-cartridge',
      'https://p2lrn.org/profile/ims-content-package',
      'https://p2lrn.org/profile/qti',
    ],
    mediaTypes: ['text/html', 'application/xhtml+xml', 'application/zip', 'application/octet-stream'],
    dependencies: [DOM_DEPENDENCY],
    supports: ({representation}) => supportsPackageRuntime(representation),
    load: () => import('./renderers/package-runtime.js'),
  });
  registry.register({
    id: QTI_RUNTIME_RENDERER, version: '1', priority: 111, presentation: 'assessment',
    profiles: ['https://p2lrn.org/profile/qti'],
    mediaTypes: ['application/xml', 'text/xml', 'application/qti+xml'],
    dependencies: [DOM_DEPENDENCY],
    supports: ({representation}) => ['embedded', 'package-member'].includes(representation?.location?.type),
    load: () => import('./renderers/qti-runtime.js'),
  });
  registry.register({
    id: COMPOSITE_RENDERER, version: '1', priority: 120, presentation: 'composite',
    profiles: [NATIVE_COMPOSITE_PROFILE], mediaTypes: [NATIVE_COMPOSITE_MEDIA_TYPE],
    dependencies: [DOM_DEPENDENCY], load: () => import('./renderers/native-composite.js'),
  });
  registry.register({
    id: COMPONENT_ROUTER_RENDERER, version: '1', priority: 115, presentation: 'component',
    profiles: [NATIVE_COMPONENT_PROFILE], mediaTypes: [NATIVE_COMPONENT_MEDIA_TYPE],
    dependencies: [DOM_DEPENDENCY], load: () => import('./renderers/native-component.js'),
  });
  registry.register({
    id: CALLOUT_COMPONENT_RENDERER, version: '1', priority: -1000, presentation: 'component-implementation',
    selectable: false,
    profiles: [NATIVE_COMPONENT_PROFILE], mediaTypes: [NATIVE_COMPONENT_MEDIA_TYPE],
    dependencies: [DOM_DEPENDENCY], load: () => import('./renderers/component-callout.js'),
  });
  registry.register({
    id: TIMELINE_COMPONENT_RENDERER, version: '1', priority: -1000, presentation: 'component-implementation',
    selectable: false,
    profiles: [NATIVE_COMPONENT_PROFILE], mediaTypes: [NATIVE_COMPONENT_MEDIA_TYPE],
    dependencies: [DOM_DEPENDENCY], load: () => import('./renderers/component-timeline.js'),
  });
  registry.register({
    id: CAPABILITY_ACTION_COMPONENT_RENDERER, version: '1', priority: -1000, presentation: 'component-implementation',
    selectable: false,
    profiles: [NATIVE_COMPONENT_PROFILE], mediaTypes: [NATIVE_COMPONENT_MEDIA_TYPE],
    dependencies: [DOM_DEPENDENCY], load: () => import('./renderers/component-capability-action.js'),
  });
  registry.register({
    id: COLLABORATION_COMPONENT_RENDERER, version: '1', priority: -1000, presentation: 'component-implementation',
    selectable: false,
    profiles: [NATIVE_COMPONENT_PROFILE], mediaTypes: [NATIVE_COMPONENT_MEDIA_TYPE],
    dependencies: [DOM_DEPENDENCY], load: () => import('./renderers/component-collaboration.js'),
  });
  registry.register({
    id: STANDARD_QUESTIONNAIRE_RENDERER, version: '1', priority: 100, presentation: 'questionnaire',
    ...questionnaire, load: () => import('./renderers/questionnaire-standard.js'),
  });
  registry.register({id: MEMORY_RENDERER, version: '1', priority: 20, presentation: 'game-2d', ...questionnaire, load: () => import('./renderers/questionnaire-memory.js')});
  registry.register({id: MATCHING_RENDERER, version: '1', priority: 20, presentation: 'game-2d', ...questionnaire, load: () => import('./renderers/questionnaire-matching.js')});
  registry.register({id: ORDERING_RENDERER, version: '1', priority: 20, presentation: 'game-2d', ...questionnaire, load: () => import('./renderers/questionnaire-ordering.js')});
  registry.register({id: CLASSIFICATION_RENDERER, version: '1', priority: 20, presentation: 'game-2d', ...questionnaire, load: () => import('./renderers/questionnaire-classification.js')});
  registry.register({id: TRUE_FALSE_RENDERER, version: '1', priority: 20, presentation: 'game-2d', ...questionnaire, load: () => import('./renderers/questionnaire-true-false.js')});
  registry.register({id: FILL_BLANKS_RENDERER, version: '1', priority: 20, presentation: 'game-2d', ...questionnaire, load: () => import('./renderers/questionnaire-fill-blanks.js')});
  registry.register({id: WORD_SEARCH_RENDERER, version: '1', priority: 20, presentation: 'game-2d', ...questionnaire, load: () => import('./renderers/questionnaire-word-search.js')});
  registry.register({id: CROSSWORD_RENDERER, version: '1', priority: 20, presentation: 'game-2d', ...questionnaire, load: () => import('./renderers/questionnaire-crossword.js')});
  registry.register({id: ROSCO_RENDERER, version: '1', priority: 20, presentation: 'game-2d', ...questionnaire, load: () => import('./renderers/questionnaire-rosco.js')});
  registry.register({
    id: THREE_D_RENDERER, version: '1', priority: 10, presentation: 'game-3d',
    ...questionnaire, dependencies: [DOM_DEPENDENCY, WEBGL2_DEPENDENCY], load: () => import('./renderers/questionnaire-3d.js'),
  });
  registry.register({
    id: REMOTE_MEDIA_RENDERER, version: '1', priority: 90, presentation: 'media', acceptsRemoteLocation: true,
    mediaTypes: ['image/*', 'audio/*', 'video/*'], dependencies: [DOM_DEPENDENCY],
    supports: ({representation}) => representation?.location?.type === 'remote' && /^sha256:[0-9a-f]{64}$/.test(String(representation.location.expectedDigest ?? '')),
    load: () => import('./renderers/remote-media.js'),
  });
  registry.register({
    id: PASSIVE_MEDIA_RENDERER, version: '1', priority: 80, presentation: 'media',
    mediaTypes: ['image/*', 'audio/*', 'video/*'], dependencies: [DOM_DEPENDENCY], load: () => import('./renderers/passive-media.js'),
  });
  registry.register({
    id: PASSIVE_TEXT_RENDERER, version: '1', priority: 80, presentation: 'text',
    mediaTypes: ['text/plain', 'text/html'], dependencies: [DOM_DEPENDENCY], load: () => import('./renderers/passive-text.js'),
  });
  return registry;
}
