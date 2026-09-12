# P2LRN Authoring API 1

Status: Node.js/TypeScript public integration contract for Studio.

Consumers import `@p2lrn/toolkit/authoring`; long-lived integrations MUST NOT depend directly on `src/creator` or `dist/creator` internals.

```text
AUTHORING_API_VERSION = 1
AUTHORING_PROJECT_VERSION = 0.3.0
P2LRN formatVersion = 0.4.0
```

`P2LRNAuthoringWorkspace` exposes lifecycle `create`, `open`, `load`, `reload`, `upgrade`, `build`, `save` and `summary`.

Studio-facing mutations are typed and validated:

- `setCourseMetadata`
- `setEntityText`
- `setChildren`
- `addUnit`
- `addFile`
- `addUrl`
- `addWebContent`
- `addQuestionnaire`
- `addComponent`
- `addComposite`

Each typed mutation edits a detached draft, validates project 0.3, writes `p2lrn.project.json`, then updates in-memory workspace state. `project` is detached inspection data. `replace` and callback-based `update` remain low-level compatibility escape hatches and are deprecated for Studio integrations.

Project 0.3 preserves imported portable IDs, entity order, entrypoints, graph/profile declarations and package payloads that do not require semantic rewriting. The conformance gate opens and rebuilds all 17 canonical course packages with identical `contentRoot`.

The 0.3 source schema includes the `web-directory` source used by Creator/Builder for bundled web content; `addWebContent` is regression-tested through strict package build plus Reader validation.

The editable API is course-oriented: one primary course entrypoint and one matching course entity. Other valid P2LRN Core topologies remain Reader/validator/repack territory.

`packages/toolkit/config/authoring-capabilities.json` distinguishes `author`, `openRebuild`, `transformExternal`, `validate`, `read`, `preserve` and `deliver`.

Alpha15 `.p2rln` inputs reuse canonical `p2lrn-repack --canonicalize-identifiers` before authoring materialization. Legacy Creator workspaces use explicit 0.1/0.2 -> 0.3 migration: canonical `p2lrn.project.json` is written and validated first, then the historical `p2rln.project.json` alias is removed so one editable authority remains.
