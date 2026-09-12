> **Nota de migración P2LRN/Node:** este documento deriva de la especificación Alpha15 anterior. Las reglas de formato se conservan; cualquier referencia a la antigua implementación Python es histórica. La implementación principal actual es `@p2lrn/toolkit` en Node.js/TypeScript.

# P2LRN 0.4.0 Reading System Contract

Status: normative draft.

## 1. Requirement

P2LRN defines a Reading System independently of any LMS implementation. The `.p2lrn` file is data; executable reader code MUST NOT be embedded in every package.

A conforming P2LRN Reading System opens the extension itself and MUST be able to:

1. validate Core structure and integrity before presentation;
2. resolve the primary entrypoint;
3. navigate the portable graph without local database IDs;
4. expose metadata and structural content;
5. negotiate representations against installed capabilities;
6. deliver native representations it actually supports;
7. delegate specialized standards to explicit runtime plugins;
8. preserve unsupported-but-preservable content without claiming it was understood;
9. avoid network access and code execution merely because the file was opened.

## 2. Reader vs runtime

The Reading System is the stable host. A Runtime is a profile-specific execution component.

```text
.p2lrn
   ↓
P2LRN Reading System
   ├── Core validator
   ├── graph navigator
   ├── resolver
   ├── capability registry
   ├── Renderer Registry + Dependency Registry
   │      ├── passive text/media renderers
   │      ├── standard native questionnaire
   │      ├── lazy 2D questionnaire games
   │      ├── lazy WebGL2 questionnaire renderer
   │      └── native composite renderer -> recursively resolves child Activities
   └── specialized runtime registry
          ├── SCORM runtime
          ├── cmi5 runtime
          ├── H5P runtime
          ├── QTI runtime
          ├── LTI launcher
          └── future profiles
```

A Reading System MUST NOT call locating a SCORM launch member “SCORM delivery” unless a SCORM runtime is actually present.

### 2.1 Thin host runtime

The generic renderer implementation is installed with the Reading System and SHOULD NOT be copied into every `.p2lrn`. A package may carry a declarative renderer preference, while registry selection, lazy module loading, dependency detection and permission decisions remain host concerns. See `RENDERER-REGISTRY.md` and `THIN-PACKAGES.md`.

## 3. Native reader baseline

A baseline reader SHOULD deliver, without optional profile runtimes:

- UTF-8 text;
- passive HTML/Web Content;
- images supported by the host;
- audio/video supported by the host;
- PDF when the host provides a PDF renderer;
- declarative `native-questionnaire` content when that profile is advertised as `deliver`; 0.4.0a7 includes resumable total/per-question timing in the standard renderer and total-attempt timing in game renderers;
- declarative `native-composite` activities, resolving children from graph order and invoking the same installed renderer registry recursively;
- declarative `native-component` instances when an exact compatible component implementation is present in the host Component Registry. The Reader advertises those implementations separately through `component-capabilities/0.1` so Core capability documents remain unchanged.

Passive HTML SHOULD be sandboxed and MUST NOT gain arbitrary script execution simply because it is contained in P2LRN.

## 4. Specialized runtime interface

Every runtime plugin advertises:

```json
{
  "profile": "https://p2lrn.org/profile/scorm",
  "modes": ["read", "deliver"],
  "runtimeVersion": "...",
  "offline": true
}
```

The host passes a side-effect-free representation plan to the runtime. The runtime does not need to understand the outer ZIP layout.

## 5. File association

Operating systems MAY associate `.p2lrn` with a P2LRN Reading System. Association is a deployment concern and is not stored inside the package.

Expected user flow:

```text
double-click course.p2lrn
        ↓
P2LRN Reader
        ↓
validate
        ↓
show course/navigation
        ↓
open supported content
```

## 6. Security boundary

Opening MUST NOT implicitly:

- fetch HTTP/IPFS resources;
- perform DNS resolution;
- start OAuth/OIDC/LTI flows;
- run SCORM/H5P/QTI JavaScript;
- write into an LMS;
- disclose local credentials.

External/network delivery is always an explicit action after the package has been validated and the required runtime/capability has been selected.

## 7. Reference implementation

P2LRN 0.4.0 ships `p2lrn_reader`, a dependency-free Python reference host with a local browser UI. It binds to loopback, protects the session with a random token, and exposes only validated package data.

```bash
python3 -m p2lrn_reader course.p2lrn
```

The reference host currently delivers passive Web Content, browser-native media, the experimental native questionnaire profile and the experimental native composite profile. Alpha 15 also contains the bounded SCORM 1.2/2004 runtime, the Alpha 13 isolated runtime-host, the Alpha 14 recovered manifest/navigation base, and the bounded hierarchical rule/attempt/rollup subset described in `spec/SCORM-WEB-RUNTIME.md`. The capability document still does not advertise blanket SCORM `deliver` conformance; global-objective mappings, the remaining sequencing controls, exhaustive CMI coverage and broader conformance evidence remain gates. Other specialized profiles remain inspect/preserve-only until their actual runtimes are implemented. The same modular player is used by the framework-neutral `<p2lrn-player>` Web Component; see `spec/NATIVE-ACTIVITY-RUNTIME.md` and `spec/SCORM-WEB-RUNTIME.md`.

Since 0.4.0a8 the local `/package.p2lrn` endpoint implements HTTP byte ranges and validators so the Web Component can use its Range/ZIP64 transport. In 0.4.0a9 the Reader additionally implements `/virtual/outer/...` and `/virtual/web/...` as the first-party `resolveResourceUrl` bridge: stored media can be byte-seeked directly inside the validated ZIP and passive web bundles can resolve mapped relative assets. Opening a package or virtual resource never authorizes unrelated graph `remote` representations. See `spec/HTTP-RANGE-ZIP64.md` and `spec/VIRTUAL-RESOURCES.md`.

Since 0.4.0a10 a plain same-origin static host may opt into the standalone `p2lrn-sw.js` bridge. Chunk-protected stored audio/video can then answer browser media ranges without a first-party application endpoint, while small mapped web assets are fully verified before delivery. Installation is explicit and refuses to replace an unrelated Service Worker that already owns the requested scope. Hosts with their own Service Worker should integrate the P2LRN registration/fetch protocol rather than install a competing worker. See `spec/STATIC-BROWSER-BRIDGE.md`.


Since 0.4.0a11 the same browser runtime is also emitted as a reproducible Web SDK/npm/CDN tree. This is a distribution form of `p2lrn_reader/web`, not a separate Reading System implementation. The generated classic loader and ESM entrypoint register the existing Web Component and preserve lazy renderer loading. See `spec/WEB-SDK-DISTRIBUTION.md`.


Since 0.4.0a12 the player can open an integrity-verified nested ZIP behind a `package-member` representation and route SCORM 1.2/2004 content to a dedicated renderer. In 0.4.0a13 that renderer can use a separately hosted `/runtime` endpoint on another origin, giving the SCO canonical parent-frame API discovery while keeping the LMS document cross-origin. CMI state remains external to `.p2lrn` and is persisted only through Host Adapter v1. The package is still authoritative for SCORM semantics; P2LRN Core sequencing is not substituted for SCORM sequencing.

In 0.4.0a14 the Reader recovered the existing `todo-funciona` XML-lite parser, manifest sequencing metadata and linear next/previous/choice resolver. In 0.4.0a15 that same module gains bounded hierarchical attempt tracking, persisted sequencing state, pre/post/exit rule execution, `exitParent`, `suspendAll` resume semantics and direct-child rollup evaluation including `useCurrentAttemptProgressInfo`. Runtime `adl.nav.request_valid.*` and post-`Terminate()` relaunch remain connected to both SCORM topologies; the Web SDK is regenerated from the same source rather than forked.
