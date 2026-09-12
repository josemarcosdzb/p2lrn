# H5P Web Runtime boundary

Status: implementation candidate layered on P2RLN Core 0.4.0. This document does not declare general H5P `deliver` conformance.

## 1. Purpose

P2RLN preserves an imported `.h5p` package bit-for-bit and projects only enough metadata to negotiate a runtime. H5P remains authoritative for H5P content semantics, library metadata and xAPI events. P2RLN does not translate H5P into a second proprietary activity model and does not copy a player into each `.p2rln` package.

The browser implementation adds a host-side H5P runtime path while keeping learner state, platform identity, credentials and LRS authority outside the portable package.

## 2. Topology

```text
application origin
  P2RLN player
    -> verify outer .p2rln
    -> verify/open preserved nested .h5p
    -> inspect h5p.json + content/content.json + library metadata
    -> create bounded binary runtime session
            |
            v
isolated runtime origin
  /runtime/h5p/session     ephemeral package/library view
  /runtime/h5p/            H5P shell
  /runtime/h5p/assets/     host-installed H5P Standalone assets
            |
            v
  H5P content executes only inside the isolated runtime origin
```

The H5P shell and the embedding application must not share an origin. The player rejects a same-origin H5P runtime URL with `P2RLN_H5P_RUNTIME_ORIGIN_NOT_ISOLATED`.

The control channel is a transferred `MessageChannel`. No learner/runtime token is put in the `.p2rln`, URL query or URL fragment.

## 3. Runtime asset model

The runtime host does not vendor H5P core into each course. `h5pStandaloneDir` points at a host-installed H5P Standalone distribution containing at least:

- `main.bundle.js`
- `frame.bundle.js`
- `styles/h5p.css`

The integration target used for this implementation is `tunapanda/h5p-standalone` 3.8.2 (MIT, released 2026-03-24). The upstream release asset advertises SHA-256 `bd2ca8486466006799e4d64732b18188afbaa69852ab97534b6e99e5f3ca4f57` for the release archive.

The repository does not currently vendor those upstream bytes. Therefore the source-level/session gates in this candidate are not equivalent to a real-browser H5P 3.8.2 conformance gate.

If the required runtime assets are absent, `/health` reports `h5p.configured=false`, the H5P shell returns 503, and P2RLN must not claim H5P `deliver` capability.

## 4. Preserved package inspection

Before a runtime session is created, the browser inspector requires:

- root `h5p.json`;
- `content/content.json`;
- a non-empty `mainLibrary`;
- `mainLibrary` to be declared by `preloadedDependencies`;
- dependency entries with a non-empty `machineName` and non-negative integer `majorVersion`/`minorVersion`;
- bundled `*/library.json` metadata with valid machine name and version.

Dependency identity is exact on `(machineName, majorVersion, minorVersion)`. A library with the same machine name but another version is not treated as compatible.

The Creator projects `dependencyMode` as:

- `bundled`: every directly required preloaded dependency is present at the exact declared version;
- `external`: none of the directly required dependencies is bundled;
- `mixed`: only part of that direct set is bundled.

The profile validator recalculates this value from the preserved `.h5p` and rejects contradictory P2RLN metadata.

## 5. Runtime session protocol

The player does not Base64-encode the `.h5p`. It sends a binary `application/vnd.p2rln.h5p-session` payload:

```text
uint32be magic = 0x50324835  # "P2H5"
uint32be manifestLength
manifestLength bytes UTF-8 JSON
concatenated uncompressed file bytes
```

The JSON manifest uses protocol `p2rln-h5p-session/1` and contains canonical, contiguous `{path, offset, length}` descriptors. The server rejects unsafe paths, duplicate files, gaps, overlaps, trailing bytes, excessive file counts and excessive total bytes.

Sessions are random, ephemeral and memory bounded. Defaults are:

- maximum package payload: 512 MiB;
- maximum session upload: 520 MiB;
- maximum files: 10,000;
- maximum active sessions: 32;
- maximum aggregate active session bytes: 1 GiB;
- TTL: 1 hour, refreshed on access.

When count or aggregate memory limits are reached, the oldest sessions are evicted. A single session larger than the aggregate capacity is rejected instead of forcing the process past the configured memory budget.

The host returns relative session paths rather than constructing absolute URLs from untrusted `Host` or forwarding headers. The browser resolves them against the configured runtime origin.

## 6. Library resolution

Runtime dependency resolution walks the exact preloaded dependency graph recursively.

Resolution order for each exact dependency is:

1. library embedded in the preserved `.h5p`;
2. exact version in the host-configured `h5pLibrariesDir`.

A missing exact dependency returns `P2RLN_H5P_LIBRARIES_MISSING`. If one graph requires two incompatible versions of the same `machineName`, the session is rejected with `P2RLN_H5P_LIBRARY_VERSION_CONFLICT` rather than serving an arbitrary version.

Folder aliases are bound to the version selected for that session. This is required because older H5P packages use unversioned library directory names while newer packages can use `MachineName-major.minor` names.

`dynamicDependencies` and broader H5P Hub/library acquisition policy are not a license for network fetching. This runtime does not download missing libraries automatically.

## 7. Embed type

The shell respects the package's declared `embedTypes`:

- prefer `iframe` when allowed;
- otherwise use `div` when allowed;
- fall back to `iframe` only when the package does not declare a usable type.

A `div` H5P still executes inside the dedicated H5P runtime origin, not inside the LMS/application document.

## 8. State and xAPI boundary

Learner state remains host state. On launch the Host Adapter may provide prior state through `loadState`; the shell restores it as H5P `contentUserData`. Current H5P state is obtained from `getCurrentState()` and returned through the private channel for `saveState`.

Bounds before crossing the runtime channel:

- H5P state: 2 MiB JSON;
- one H5P xAPI statement: 1 MiB JSON.

Values must be JSON serializable. Oversized or unserializable values are rejected as runtime errors rather than persisted blindly.

H5P xAPI events are emitted as `p2rln:xapi` with `authoritative:false`. Any LMS/LRS integration must rebuild trusted actor, authority, registration/session identifiers and other platform-owned fields server-side. The package/runtime statement is content-generated input, not an authenticated LRS statement.

Scores extracted from non-terminal interactions may be surfaced as runtime events. `HostAdapter.reportScore` is invoked only for terminal `completed`, `passed` or `failed` xAPI verbs. Those score payloads are also marked non-authoritative.

## 9. Network and browser isolation

The H5P document CSP intentionally denies arbitrary network egress:

- `connect-src 'self'`;
- images/media limited to `self`, `data:` and `blob:`;
- frames limited to `self`, `about:` and `blob:`;
- objects disabled;
- forms disabled.

Remote YouTube/video/iframe H5P content is therefore not silently enabled. A future host permission policy may selectively add external origins, but the secure default is offline/self-contained execution.

`allowedParentOrigins` controls browser CORS and `frame-ancestors`; production deployments should set an explicit application origin and use a dedicated cookie-less runtime origin. CORS is not server authentication and the runtime host should still sit behind normal deployment-level abuse/rate-limit controls.

## 10. Current real-package gates

Using the three supplied H5P packages after full `.p2rln` transformation and outer-container verification:

| Package | Main library | Mode | Runtime-session result |
| --- | --- | --- | --- |
| `boardgame.h5p` | `H5P.Boardgame` | bundled | accepted; 353 files; 12 recursively resolved dependencies |
| `example-content-crossword-1209160.h5p` | `H5P.Crossword` 0.5 | external | rejected until exact host library exists |
| `example-content-arts-of-europe-443085.h5p` | `H5P.BranchingScenario` 1.8 | external | rejected until exact host library exists |

The two external-package rejections are expected capability failures, not parser failures.

## 11. Capability claim

The reference `capabilities.json` may advertise H5P `validate`, `read` and `preserve` after the stricter parser/validator work. It must not advertise unconditional H5P `deliver` yet.

A general `deliver` claim still requires at least:

1. a real, pinned H5P Standalone distribution available to the test environment;
2. real-browser launch of representative bundled and host-library-backed H5P content;
3. verified resume/state round trip;
4. verified xAPI/score/completion event flow;
5. fullscreen/resize/accessibility checks;
6. hostile-content and resource-exhaustion browser tests;
7. a defined host capability negotiation surface for exact H5P library availability;
8. broader H5P content-type corpus coverage.

### Host library asset closure

An exact `library.json` is not sufficient to make a host-provided H5P library runnable. Before a runtime session is accepted, the host also verifies every file declared by that library's `preloadedJs` and `preloadedCss`. The same rule applies recursively to every preloaded dependency and to libraries bundled inside the `.h5p` payload.

If any declared preloaded asset is absent, unsafe, outside the configured library root, or resolves through a symbolic-link escape, session creation fails closed with `P2RLN_H5P_LIBRARY_ASSETS_MISSING` (HTTP 409). A 201 response therefore means that both the exact dependency graph and its declared preloaded runtime assets are physically present.
