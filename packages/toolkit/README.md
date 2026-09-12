# @p2lrn/toolkit

Primary Node.js/TypeScript implementation of P2LRN.

It provides Core validation/integrity, ZIP/ZIP64, Creator/Builder, stable Studio-facing authoring API, Reader/Reading System, external-package preservation/conversion, AulaP2P bridges, native questionnaire/component/composite validation, deltas and Ed25519 signatures.

```bash
npm run build
npm test
node dist/cli/main.js --help
```

## Stable authoring API

`@p2lrn/toolkit/authoring` is the supported integration boundary for Studio. `AUTHORING_API_VERSION` is `1`; project schema is `0.3.0`.

```ts
import {P2LRNAuthoringWorkspace} from '@p2lrn/toolkit/authoring';
const workspace = P2LRNAuthoringWorkspace.open('course.p2lrn', './workspace');
workspace.update((draft) => { draft.course.revision += 1; });
workspace.build('course-v2.p2lrn', {strictProfiles: true});
```

CLI:

```bash
p2lrn-create open course.p2lrn workspace
p2lrn-create build workspace course-v2.p2lrn --strict-profiles
p2lrn-create upgrade workspace
```

A no-op open/build of all 17 canonical examples retains exact `contentRoot`. Alpha15 `.p2rln` packages are canonically migrated before authoring materialization.
