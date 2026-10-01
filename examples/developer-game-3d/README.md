# P2LRN Quest/Game 3D example

This example is standalone P2LRN code. It does not import or call AulaP2P.

It creates one native questionnaire containing:

- ordering;
- matching;
- classification.

The activity explicitly requests the P2LRN 3D renderer. The browser renderer uses bundled Three.js for scene rendering and bundled Rapier 3D for rigid-body physics, with an accessible HTML control surface as fallback.

Run after installing/building the toolkit:

```bash
node create-game-3d.mjs ./out
```

Output:

```text
out/
├─ quest-3d-course.p2lrn
├─ source/
│  └─ quest-3d.json
└─ workspace/
   └─ p2lrn.project.json
```
