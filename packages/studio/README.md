# @p2lrn/studio

Embeddable visual authoring surface for P2LRN.

Browser:

```html
<p2lrn-studio
  src="/course/course.p2lrn"
  save-endpoint="/api/p2lrn/studio/save"
  course-path="course">
</p2lrn-studio>
```

`course-path` defaults to `course`.

A browser cannot create or write an arbitrary server folder by itself. `save-endpoint` is therefore the host-owned write boundary. The npm server helper creates the requested directory when it does not exist and defaults to `course/`.

Next.js / Web Request compatible route:

```js
import {handleP2LRNStudioSave} from '@p2lrn/studio/server';
export const POST = (request) => handleP2LRNStudioSave(request);
```

Use `Download .p2lrn` when no server save endpoint is desired.
