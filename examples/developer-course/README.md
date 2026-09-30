# P2LRN developer course example

This example creates a real P2LRN package using only the public authoring API.

## Run

```bash
npm install @p2lrn/toolkit
node create-course.mjs ./out
```

Generated output:

```text
out/
├─ curso-ejemplo.p2lrn
├─ materials/
│  ├─ intro.html
│  └─ practice.html
└─ workspace/
   ├─ p2lrn.project.json
   └─ ...
```

The example demonstrates:

- creating a workspace;
- adding a unit;
- embedding two HTML learning resources;
- adding an external documentation URL;
- setting progression rules;
- building with strict profile validation.

For large embedded payloads, build the normal package first and then split the oversized representation:

```bash
p2lrn-multipart out/curso-ejemplo.p2lrn out/curso-ejemplo-split.p2lrn --part-size 26214400
```

Keep the outer `.p2lrn` and every generated `.partNNN` file together under the same public URL directory.
