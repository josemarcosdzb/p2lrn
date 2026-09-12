# P2LRN Authoring API 1

Status: Node.js/TypeScript public integration contract for Studio.

Consumers import `@p2lrn/toolkit/authoring`; long-lived integrations MUST NOT depend directly on `src/creator` or `dist/creator` internals.

```text
AUTHORING_API_VERSION = 1
AUTHORING_PROJECT_VERSION = 0.3.0
P2LRN formatVersion = 0.4.0
```

`P2LRNAuthoringWorkspace` exposes `create`, `open`, `load`, detached `project`, `update`, `replace`, `reload`, `upgrade`, `build` and `summary`.

Project 0.3 preserves imported portable IDs, entity order, entrypoints, graph/profile declarations and package payloads that do not require semantic rewriting. The conformance gate opens and rebuilds all 17 canonical course packages with identical `contentRoot`.

The editable API is course-oriented: one primary course entrypoint and one matching course entity. Other valid P2LRN Core topologies remain Reader/validator/repack territory.

`packages/toolkit/config/authoring-capabilities.json` distinguishes `author`, `openRebuild`, `transformExternal`, `validate`, `read`, `preserve` and `deliver`.

Alpha15 `.p2rln` inputs reuse canonical `p2lrn-repack --canonicalize-identifiers` before authoring materialization. Legacy Creator workspaces use explicit 0.1/0.2 -> 0.3 migration, preserve the legacy file and preserve prior emitted Creator metadata so a no-op upgrade does not change `contentRoot`.
