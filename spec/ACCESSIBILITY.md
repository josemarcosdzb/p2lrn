# Accessibility Metadata and Representation Selection

Status: portable metadata and consumer-selected accessible representations.

P2LRN uses representation-level accessibility metadata. Metadata describes known characteristics; it does not by itself certify WCAG conformance.

## Metadata

The accessibility profile extension on a Representation supports schema.org-style fields:

- `accessMode`;
- `accessModeSufficient`;
- `accessibilityFeature`;
- `accessibilityHazard`;
- `accessibilityControl`;
- `accessibilityAPI`;
- `accessibilitySummary`.

The graph's existing `representation.accessibility` array is the quick-view list of `accessibilityFeature` vocabulary values. The structured profile extension remains authoritative for the complete metadata.

The Authoring API exposes `setRepresentationAccessibility()`.

## Accessible alternatives

Semantically equivalent accessible alternatives should be separate Representations of the same Resource, normally using role `accessible`.

The Player does not globally replace `primary` with `accessible`. A host or embedding application can request:

`representationRole: "accessible"`

or set `player.preferredRepresentationRole = "accessible"`.

That preference affects renderer selection for that consumer only.

## Conformance boundary

P2LRN packaging can preserve accessibility metadata and provide accessible selection mechanisms. It cannot certify that arbitrary HTML, video, H5P, QTI or third-party tools satisfy WCAG 2.2 AA merely because metadata is present.

## Gates

- `packages/toolkit/test/accessibility-metadata.test.mjs`
- `packages/toolkit/test/representation-role.test.mjs`
- accessibility assertions in `packages/toolkit/test/authoring-studio-boundary.test.mjs`
