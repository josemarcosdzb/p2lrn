# P2LRN Progression Profile

Status: experimental profile for P2LRN Core 0.4.0.

Progression is **opt-in**. A course that does not declare
`https://p2lrn.org/profile/progression` behaves exactly like an ordinary P2LRN
course with free navigation.

## Entity extension

Rules are stored on course, unit or activity entities:

```json
{
  "extensions": {
    "https://p2lrn.org/profile/progression": {
      "required": true,
      "gateFollowing": true,
      "completionRequirement": "passed",
      "minScore": 80
    }
  }
}
```

### required

`required: true` marks the entity as required. It does **not** block later
content by itself.

This permits a course to distinguish required and optional learning material
without forcing a linear navigation model.

### gateFollowing

`gateFollowing: true` makes later siblings under the same parent inaccessible
until this entity is satisfied.

For an Activity, satisfaction uses its `completionRequirement`.

For a Unit, the gate is satisfied when all descendant Activities marked
`required: true` are satisfied. If the Unit contains no explicitly required
Activities, all descendant Activities participate.

A simple authoring control labelled “Required before continuing” can therefore
write both:

```json
{
  "required": true,
  "gateFollowing": true
}
```

### completionRequirement

Allowed values:

- `viewed`: the activity has been rendered/viewed;
- `completed`: the runtime emitted completion;
- `passed`: the runtime reported pass, or an explicit `minScore` threshold is
  met when the runtime has no authoritative pass/fail value.

The default is `completed`.

### minScore

`minScore` is a percentage from 0 through 100 and is valid only on Activities.

Example:

```json
{
  "required": true,
  "gateFollowing": true,
  "completionRequirement": "passed",
  "minScore": 80
}
```

### unlockWhen

Advanced prerequisites can be expressed independently of sibling order:

```json
{
  "unlockWhen": {
    "all": [
      {
        "entity": "urn:course:assessment-1",
        "status": "passed",
        "minScore": 80
      }
    ]
  }
}
```

Exactly one of `all` or `any` is allowed.

## Manifest requirement

Using the profile is optional.

When a package only uses non-blocking `required` metadata, the manifest MAY
declare the profile as optional or required.

When a package uses `gateFollowing` or `unlockWhen`, the manifest MUST declare
the progression profile with `"requirement": "required"`. Otherwise a Player
that does not understand progression could silently allow navigation that the
author intended to block.

## Runtime state

Learner progression state does not live inside the portable package. A Player
tracks it through the Host Adapter and normalizes runtime events across H5P,
SCORM, cmi5, QTI, native questionnaires and other renderers.

The first-party state shape is versioned as:

```text
p2lrn-progression-state/1
```
