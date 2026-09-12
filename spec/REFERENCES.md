> **Nota de migración P2LRN/Node:** este documento deriva de la especificación Alpha15 anterior. Las reglas de formato se conservan; cualquier referencia a la antigua implementación Python es histórica. La implementación principal actual es `@p2lrn/toolkit` en Node.js/TypeScript.

# Standards references used by P2LRN 0.4.0

This draft intentionally reuses existing standards rather than reproducing their full semantics.

- JSON Schema Draft 2020-12: https://json-schema.org/draft/2020-12
- I-JSON (RFC 7493): https://www.rfc-editor.org/rfc/rfc7493
- JSON Canonicalization Scheme (RFC 8785): https://www.rfc-editor.org/rfc/rfc8785
- UUIDs (RFC 9562): https://www.rfc-editor.org/rfc/rfc9562
- Language tags (BCP 47 / RFC 5646): https://www.rfc-editor.org/rfc/rfc5646
- 1EdTech QTI: https://www.1edtech.org/standards/qti
- 1EdTech QTI example packages: https://github.com/1EdTech/qti-examples
- 1EdTech LTI: https://www.1edtech.org/standards/lti
- WCAG 2.2: https://www.w3.org/TR/WCAG22/
- 1EdTech Common Cartridge: https://www.1edtech.org/standards/cc
- 1EdTech CASE: https://standards.1edtech.org/case/
- H5P package specification: https://h5p.org/documentation/developers/h5p-specification
- ADL SCORM project/reference material: https://adlnet.gov/projects/scorm/
- cmi5 current specification site: https://aicc.github.io/CMI-5_Spec_Current/
- xAPI specification repository: https://github.com/adlnet/xAPI-Spec
- Legacy Tin Can JavaScript/package ecosystem reference: https://github.com/RusticiSoftware/TinCanJS
- HTTP Semantics / Range Requests (RFC 9110): https://www.rfc-editor.org/rfc/rfc9110
- PKWARE ZIP Application Note / ZIP64: https://support.pkware.com/pkzip/appnote

These references are informative unless a P2LRN profile explicitly makes a referenced standard normative for that profile.

## Native runtime/tooling drafts

- `NATIVE-COMPONENT.md` - data-only native component instance/profile binding.
- `COMPONENT-REGISTRY.md` - trusted host component lookup, migration and renderer delegation.
- `component-capabilities/0.1` - separate host implementation advertisement used by the first-party Reader without widening Core capabilities.
- `COMPONENT-AUTHORING.md` - external catalog, JSON data schema and declarative editor-schema separation for independent authoring tools.
- `DETACHED-SIGNATURES.md` - experimental detached Ed25519 signatures and explicit trust-store boundary.
- `DELTA-UPDATES.md` - experimental detached resource-level update sidecars that reconstruct an ordinary validated P2LRN target.
- `HTTP-RANGE-ZIP64.md` - HTTP byte-range package discovery, ZIP64 directory support, lazy payload verification and bounded large-binary access.
- `VIRTUAL-RESOURCES.md` - host-verified inner-resource URLs, stored-member seekability and passive web-content relative asset mapping.

