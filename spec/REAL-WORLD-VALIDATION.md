> **Nota de migración P2LRN/Node:** este documento deriva de la especificación Alpha15 anterior. Las reglas de formato se conservan; cualquier referencia a la antigua implementación Python es histórica. La implementación principal actual es `@p2lrn/toolkit` en Node.js/TypeScript.

# P2LRN 0.4.0 Real-world package validation

Date: 2026-09-07

This validation pass used user-supplied learning packages rather than synthetic fixtures. The purpose was to test the P2LRN Core/profile boundary, preservation model, version detection, package projection and profile-specific validation.

## Corpus

| Source | Observed format | Key observation | P2LRN result |
|---|---|---|---|
| `ScormBilanMoodle.zip` | SCORM 1.2 inferred | 1 SCO; no explicit schema version; includes two `.php` files | Preserved bit-for-bit; profile validation passes |
| `scorm(1).zip` | SCORM 1.2 | ~67 MB; 1 SCO | Preserved bit-for-bit; profile validation passes |
| `scorm2004(1).zip` | SCORM 2004 3rd Edition | ~67 MB; sequencing metadata present | Preserved bit-for-bit; profile validation passes |
| `Scorm12(1).zip` | SCORM 1.2 | Golf sample, 1 SCO | Preserved bit-for-bit; profile validation passes |
| `SCORM20043rdEdition(1).zip` | SCORM 2004 3rd Edition | Golf sample, 1 SCO | Preserved bit-for-bit; profile validation passes |
| `example-content-crossword-1209160.h5p` | H5P | Main library declared, no library code bundled | Preserved bit-for-bit; `dependencyMode=external` |
| `example-content-arts-of-europe-443085.h5p` | H5P | Branching Scenario, no library code bundled | Preserved bit-for-bit; `dependencyMode=external` |
| `boardgame.h5p` | H5P | 19 library descriptors present; declared preloaded dependencies available | Preserved bit-for-bit; `dependencyMode=bundled` |
| `topkit-export(spanish).imscc` | IMS Common Cartridge 1.1 | 419 resources, 116 organization items; LOM title is `TOPkit` | Preserved bit-for-bit; full 419-resource inventory projected; 536 P2LRN entities |
| `CATAPULT-main.zip` | cmi5 source/conformance repository | Not one cmi5 course package; contains many `cmi5.xml` fixtures | Selected course roots normalized for testing; Course/Block/AU projection passes |
| `xapi-package-main.zip` | legacy Tin Can launch-package source repository | `tincan.xml`; source activity ID is placeholder `[YOUR_HOST]/...` | Normalized nested package; deliberately classified as legacy Tin Can, not xAPI itself |

## Common Cartridge stress result

The supplied Common Cartridge 1.1 contains:

- 419 resources total;
- 303 `webcontent` resources;
- 73 associated-content resources;
- 32 discussion-topic resources (`imsdt_xmlv1p1`);
- 7 QTI 1.2 assessment resources;
- 3 Basic LTI 1.0 resources;
- 1 web-link resource;
- 116 organization items.

The current projector maps the organization tree and all 419 manifest resources to 536 P2LRN entities while retaining the original `.imscc` payload as the lossless authority. QTI resources receive QTI representations, Basic LTI resources receive external-tool intent with local re-binding required, and directly addressable members use `package-member` without copying bytes out of the cartridge.

## cmi5 hierarchy result

The CATAPULT `pre_post_test_framed` fixture contains two Blocks and six AUs. It projects to:

- 1 P2LRN Course;
- 2 P2LRN Units;
- 6 P2LRN Activities;
- 6 P2LRN Resources;
- 15 entities total.

The cmi5 profile keeps cmi5-specific `moveOn`, `masteryScore`, `launchMethod`, launch URL, launch parameters and entitlement data in profile metadata rather than flattening them into lossy Core fields.

## H5P result

The corpus proves that an `.h5p` file cannot be assumed to be self-contained with all libraries. Two valid content examples declare their main library but do not include the library implementation, while `boardgame.h5p` bundles its dependencies. P2LRN 0.4.0 therefore distinguishes:

- `bundled`: all declared preloaded libraries are present in the H5P package;
- `external`: required libraries are expected from the H5P host;
- `mixed`: some declared libraries are bundled and some are external.

Preservation capability is separate from delivery capability.

## SCORM result

The corpus demonstrates that version detection cannot rely on the file extension or one metadata field. `ScormBilanMoodle.zip` lacks the usual explicit `schema/schemaversion` declaration but contains SCORM 1.2 structures (`adlcp_rootv1p2.xsd` and `scormtype=sco`). P2LRN therefore records an inferred version when necessary instead of silently labeling it as generic ZIP or site content.

SCORM 2004 sequencing remains governed by the original SCORM package. P2LRN may project item/resource structure but MUST NOT claim that Core ordering or relations replace SCORM sequencing rules.

## Security result

Real packages confirm why original educational packages must remain nested payloads instead of being flattened into the outer P2LRN namespace:

- legacy internal paths contain spaces and other historical naming patterns;
- packages can contain executable web assets, nested ZIP files or server-side source such as `.php`;
- the P2LRN outer container can retain strict portable ASCII/content-addressed paths while the original package remains byte-for-byte intact.

Core validation never executes nested content or dereferences remote URLs. Profile validation checks nested ZIP safety, required manifests and relative launch targets without launching code.

## Architecture changes caused by this corpus

P2LRN 0.4.0 adds or formalizes:

1. representation-level namespaced extensions;
2. `packages/sha256/...` as a content-addressed payload layout alongside `assets/sha256/...`;
3. distinct SCORM, cmi5, Common Cartridge, H5P and legacy Tin Can package profiles;
4. profile payload validation separate from Core validation;
5. H5P dependency modes;
6. source-format metadata projection while retaining the original package;
7. strict distinction between xAPI as a runtime/statement standard and legacy `tincan.xml` packaging;
8. full manifest-resource projection for the supplied Common Cartridge, including resources outside the selected organization tree;
9. `package-member` locations for reading members inside preserved packages without flattening them;
10. auditable transformation reports with source mappings, fidelity, warnings and losses;
11. safe read plans and target-neutral import plans;
12. direct packaged-QTI detection/projection plus LTI/CASE/xAPI/accessibility profile drafts.

## Result

All nine direct package files were successfully wrapped as P2LRN 0.4.0 with their original package bytes preserved exactly. The two repository ZIPs were not falsely treated as single learning packages: a concrete package root was selected and normalized before testing. All generated wrappers passed Core validation, strict profile-version validation and profile-specific payload validation.

## Automated regression gate

The final 0.4.0 reference suite passes 44/44 tests. In addition to the supplied-corpus tests, the gate now proves that:

- a SCORM package whose relative launch target is missing is rejected by SCORM profile validation;
- an H5P package without `content/content.json` is rejected by H5P profile validation;
- a cmi5 AU with an absolute remote launch URL validates structurally without the validator dereferencing the URL;
- a packaged QTI 3 manifest is detected independently of Common Cartridge/SCORM, projected to Assessment Activities/Resources and resolved to its exact QTI XML member;
- a preserved H5P source can be imported as opaque/preservable when the receiver lacks H5P read support, without being dropped;
- a neutral P2LRN reader/writer can change physical package bytes and package ID while keeping the same logical `contentRoot`;
- broken P2LRN references and hierarchy cycles are rejected after integrity validation;
- undeclared representation profiles and unsupported required profile versions are rejected;
- `packages/sha256/...` and `assets/sha256/...` remain content-addressed.

A second pass over all generated real-world wrappers also passed Core validation, strict profile-version validation and nested profile-payload validation.


## Reading/transformation result

The 0.4.0 reader resolves the supplied SCORM 1.2 example from `Course -> Activity -> Resource` to the exact nested launch member `shared/launchpage.html` through `package-member`, without extracting the whole source archive or starting a SCORM runtime. This sentence records the earlier corpus-reading validation; Alpha 12 subsequently added an explicit bounded standalone SCORM web runtime without changing that passive-open behavior; Alpha 13 adds the separately hosted isolated parent-frame topology for canonical API discovery; Alpha 14 adds the recovered `todo-funciona` manifest/linear navigation base without changing the preserved source package.

For the supplied TOPkit cartridge, the reader sees the projected hierarchy and complete Resource inventory. The reference capabilities produce 103 hierarchical activities: 97 are readable with the currently declared capabilities and 6 QTI activities are correctly reported as unsupported for semantic `read` rather than being falsely treated as understood through the surrounding cartridge. The target-neutral import plan covers all 419 Resources: 412 are interpretable, 7 QTI resources are preserved opaquely, and 0 are discarded/unsupported. The single Common Cartridge web-link resource is projected as its real remote URL, while 32 discussion-topic descriptors expose their source discussion metadata and remain backed by the exact cartridge bytes.

The transformation report separates exact source-byte preservation from structural projection quality. This allows `sourceBytes=exact`, `structuralProjection=partial`, `runtimeSemantics=delegated-to-source-profile` and `losses=[]` to coexist without falsely claiming that P2LRN Core has reimplemented the source runtime.


## Final conversion matrix

After the reader/transformation changes, the entire supplied corpus was converted again rather than relying on earlier wrappers. Five SCORM packages, three H5P packages, the TOPkit Common Cartridge, one selected CATAPULT cmi5 course root and the selected legacy `tincan.xml` package root all passed conversion plus strict Core/profile validation. A separate QTI 3 packaging fixture matching the current QTI 3 packaging structure was also included.

Result: **12/12 conversion cases passed, 0 failed**. Direct educational-package inputs were preserved bit-for-bit. The two repository ZIPs intentionally use `normalized-subpackage`, so their transformation reports record the exclusion of repository files outside the selected educational package root as a deliberate loss relative to the repository archive, not relative to the selected course package.

Machine-readable results are in `corpus/reports/full-matrix-0.4.0.json`.
