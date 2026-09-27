# P2LRN Editor

This application is the visual authoring surface for the P2LRN repository. It is not a second format implementation.

Architecture:

```
browser UI
  -> Editor HTTP host
  -> @p2lrn/toolkit/authoring
  -> .p2lrn

preview
  -> @p2lrn/player
  -> the package just built by the same authoring workspace
```

Rules:

- The UI uses the public `@p2lrn/toolkit/authoring` contract. It must not import Creator internals.
- Existing `.p2lrn` packages bypass document ingestion and open through the authoring workspace.
- Source documents are handled by the neutral document-reader package once that extraction is complete.
- The author sees course/module/lesson/content concepts. Portable IDs, manifests, digests, profiles and ZIP details are automatic unless an advanced diagnostics panel is opened.
- Preview uses the shipped P2LRN Player, not a second rendering implementation.
- AulaP2P is not a runtime dependency or architectural authority of this application.

The first host exposes a deliberately small API for project creation, hierarchy editing and preview builds. More typed authoring operations are added to the toolkit before the UI exposes them.
