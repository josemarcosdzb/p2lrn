# P2LRN Offline Assignment / Self-Playing Delivery

Status: **implementation + roadmap** for an additive Reading-System/export mode. The current Windows EXE/CMD/ZIP release supports a native single-file x64 EXE, optional Ed25519 signing of the assignment, a teacher-kept receipt, and result consistency checks. The EXE is **not Authenticode-signed**; no system lockdown, TPM, independently authenticated scores or verified learner identity is provided. Planned items below must not be advertised as shipped. The core .p2lrn format and Player graph remain unchanged.

## 1. Goal

A teacher can export an existing `.p2lrn` as a self-playing offline assignment. A learner double-clicks the delivery, it opens in a browser, the learner completes it without an LMS, and the learner returns one result artifact to the teacher.

The teacher can then open the returned artifact in Studio/Review to inspect answers, score, progression, attempts, active time and the supported analytics/audit trail.

The same course package remains authoritative. The offline delivery adds a launcher/runtime envelope and an assignment policy; the Windows launcher is not a code-signed or trusted examination application.

## 2. Security claim

A fully offline assessment executed on a computer controlled by the learner cannot be mathematically cheat-proof. A learner with administrator/root control can ultimately modify software, clocks, memory or the operating system.

The currently implemented checks have a deliberately limited scope:

- optional Ed25519 signing authenticates the assignment **only when the original teacher-kept receipt is supplied during review**;
- Windows EXE packaging now checks its appended ZIP with SHA-256, serves local content via a restricted Go loopback server, and uses a stable loopback origin for browser resume; it is still not code-signed;
- legacy CMD packaging also checks the embedded ZIP SHA-256;
- the return file includes an unkeyed SHA-256 digest, an ordered operation chain and checks comparing raw events, states and scores with their summaries;
- a student with full control can change answers and recompute all unkeyed digests, or replace runtime files; these checks do not prove the result's authorship;
- absolute deadlines and attempt limits depend on the student's local clock and browser storage;
- remote collaboration capabilities are disabled, and required remote-only resources block export;
- high-stakes exams require externally supervised identity, time and machine controls.

Planned options such as durable trusted signing identities, independently authenticated result receipts, executable code signing and system attestation are **not implemented**. The signing key generated for an individual export is not retained or published. Keep the original receipt if you intend to verify its assignment later.

### Native Windows executable (implemented; publisher signing pending)

The Windows x64 launcher is built from `native/offline-launcher` using Go's standard library, with no PowerShell requirement. Studio downloads the site's prebuilt PE executable and checks its SHA-256 against the build manifest before appending the existing ZIP and a fixed 56-byte trailer. The trailer contains `P2LRN-EXE-V1`, the ZIP length and SHA-256. On launch, the EXE verifies the ZIP, rejects traversal, duplicates, symlinks and oversized entries, extracts to a private temp directory, serves resources exclusively on `127.0.0.1` with strict Host validation and opens the system browser. A deterministic per-delivery loopback port maintains the same localStorage origin across restarts.

The hash alone is not an authenticated signature: a malicious student could repack and recalculate it. Ed25519 authenticates the assignment **only after comparison with the teacher's saved original receipt**. Browser results remain untrusted. The Windows code publisher cannot be authenticated until the **final course-specific EXE is Authenticode-signed** with an approved certificate by an external trusted signing service or by the publisher. Browser-side generation does not have, and must never receive, a private publisher key. Tests and internal use are distinct from a fully signed public production release.

## 3. Export modes

Studio exposes one export surface:

`Exportar -> Entrega offline / autorreproducible`

with two implementations sharing the same assignment format.

### Universal self-playing

A portable self-playing delivery for low/medium-stakes work. It may be a single HTML delivery or a portable folder/launcher depending on browser restrictions.

It is convenient but MUST be labelled as tamper-evident rather than high-assurance.

### Protected offline delivery

**Planned protected mode (not yet delivered):** recommended for assessed work needing strong authenticity, with a signed launcher and verified teacher signature. The current Windows delivery can be a native unsigned `.p2lrn-offline.exe` with ZIP SHA-256 verification, or a legacy `.p2lrn-offline.cmd`; the portable ZIP retains the older CMD launcher for backward compatibility. Both are suitable for ordinary offline learning but are not authenticated examination applications. Equivalent signed launchers can be developed for other platforms without changing the P2LRN course or result schemas.

Double-click flow:

```text
signed launcher
      |
      +-- verifies assignment signature
      +-- verifies runtime digest
      +-- verifies .p2lrn contentRoot/package signature
      +-- starts loopback-only runtime on 127.0.0.1
      +-- opens the system browser/app window
      +-- denies undeclared/live collaboration capabilities
      +-- records local attempt evidence
      |
      +--> learner completes course
      |
      +--> Finalizar y entregar
              |
              +--> .p2lrn-result
```

The browser remains the presentation layer. The future signed/protected launcher would own the trusted persistence/export boundary; the current unsigned CMD delegates storage and result export to the browser and must not be described as a trusted evidence boundary.

### Incremento implementado: encargo firmado por el profesor

Studio permite marcar **«Firmar el encargo»** durante la exportación Windows CMD o ZIP. Genera en memoria un par Ed25519 (clave privada no exportable), firma el manifiesto de la tarea y distribuye solamente la firma y la clave pública dentro de la entrega. La copia `.p2lrn-assignment.json` se entrega **por separado al profesor** y debe conservarse fuera de los archivos del alumno.

El runtime offline comprueba la firma del manifiesto antes de permitir el comienzo y, para una entrega firmada, rechaza la ausencia de firma. Al revisar el archivo `.p2lrn-result` en Studio, el profesor puede adjuntar **su propia copia** del comprobante: Studio verifica Ed25519, identidad del curso, token de asignación y correspondencia del encargo, además de la coherencia de la cadena de evidencias y de los resúmenes. El orden original de eventos, estados y notas se conserva en `audit.recordOrder`; si una entrega antigua mezclaba tipos de operación y no guardó el orden, Studio muestra «no verificable» en lugar de atribuir una manipulación. Sin ese comprobante guardado por el profesor, una firma autocontenida en el archivo del alumno **no acredita quién emitió el encargo**.

**Alcance:** la firma autentica exclusivamente las condiciones originales de la tarea, nunca el contenido de las respuestas o las puntuaciones generado en el PC del alumno. Un atacante con control total puede modificar una entrega y recalcular hashes. Las soluciones que necesitan los juegos para ofrecer corrección inmediata pueden continuar dentro del paquete; **no existe aún modo universal de examen sin soluciones**. Studio genera un ejecutable Windows `.exe` nativo; el archivo final sigue sin firma Authenticode de editor y puede ser bloqueado por las políticas de Windows. Para publicación oficial, la firma debe aplicarse al EXE final, después de añadir el curso. Este incremento no convierte la entrega en una aplicación de examen supervisado.

## 4. Assignment envelope

The teacher exporter creates a signed assignment manifest outside the Core package.

Minimum fields:

```json
{
  "schema": "https://p2lrn.org/schema/offline-assignment/1",
  "version": "1",
  "assignmentId": "urn:uuid:...",
  "packageId": "urn:uuid:...",
  "contentRoot": "sha256:...",
  "runtime": {
    "playerVersion": "0.5.0-alpha.11",
    "runtimeDigest": "sha256:..."
  },
  "policy": {
    "availableFrom": "2026-10-26T08:00:00Z",
    "dueAt": "2026-10-30T20:00:00Z",
    "attemptDurationSeconds": 7200,
    "maxAttempts": 1,
    "allowResume": true,
    "collaboration": "disabled",
    "network": "deny-by-default",
    "activityTracking": "required"
  },
  "participant": {
    "assignmentToken": "opaque-teacher-issued-value"
  }
}
```

Dates/limits are optional when the teacher does not need them.

**Current implementation:** an optional teacher-issued Ed25519 signature authenticates the manifest when Studio is supplied with the original teacher-kept receipt. The learner's package contains the verification key and the runtime checks its signature; the Windows CMD/ZIP also verifies an embedded SHA-256 checksum. A learner can still recompute an unkeyed result digest after changing answers or scores. Independent trusted result signing, Authenticode signing of the final launcher and platform attestation are **not** implemented. The Go native EXE itself is functional but remains unsigned.

A student-specific export MAY bind a random opaque assignment token to one learner in the teacher's local roster. The package does not need to contain the learner's personal data.

## 5. Absolute time limitation

Offline software can reliably measure elapsed session duration with a monotonic clock while the process is alive. It cannot prove absolute UTC time against a learner who controls the operating-system clock.

Therefore:

- `attemptDurationSeconds` can be enforced locally with monotonic time;
- `availableFrom` and `dueAt` can be checked and clock anomalies can be recorded;
- wall-clock rollback/large jumps MUST be included as audit anomalies;
- the UI MUST NOT describe offline due-date enforcement as trusted absolute time;
- an optional connected trusted-time token can strengthen absolute dates without changing the offline result format.

If high-stakes policy requires provable deadlines, at least one trusted external timestamp is required.

## 6. Capabilities in protected offline mode

The protected host supplies no live collaboration provider.

All `collaboration.*` requirements are treated as unavailable and optional collaborative activities must use their declared individual fallback.

A package that declares collaboration as strictly required MUST NOT be exported as a protected offline assignment unless Studio can provide an explicit pedagogical fallback.

The protected host also applies a deny-by-default network policy. Remote media without an embedded verified fallback makes the export invalid. Shared resources must be materialized into the self-contained delivery and verified against their declared digest.

AI/search/live-data capabilities follow the same rule unless a trusted local provider is explicitly bundled by the exporter.

## 7. Learner state and analytics

Reuse Host Adapter v1 and the existing runtime-event envelope.

The protected local host persists:

- activity/progression resume state;
- normalized score reports;
- questionnaire attempt lifecycle;
- answer state required for teacher correction;
- ordered runtime events;
- active/idle and focus/visibility evidence when tracking is enabled;
- navigation and meaningful interaction events already defined by Runtime Events v1;
- launcher/runtime audit anomalies.

Generic analytics remains privacy-bounded. Raw free-text/key/pointer telemetry is not added.

Answers needed for grading live in the submission/state section, not duplicated throughout behavioral telemetry.

## 8. Append-only evidence chain

Each persisted audit/event record receives:

- monotonically increasing sequence;
- attempt-relative monotonic timestamp;
- observed wall-clock timestamp;
- previous-record digest;
- canonical event/state digest.

Conceptually:

```text
H0 = SHA-256(assignment identity)
H1 = SHA-256(H0 || event 1)
H2 = SHA-256(H1 || event 2)
...
Hn = final evidence root
```

This detects ordinary record insertion/deletion/reordering and accidental/post-export editing.

A hash chain alone is not a secret and does not prove the learner did not modify the runtime. The protected launcher therefore also binds the result to the verified assignment/runtime identities and signs the final result envelope with the strongest platform-backed attempt key available to the launcher.

The result verifier reports platform assurance separately rather than pretending every platform provides equivalent attestation.

## 9. Audit anomalies

The result may contain explicit anomaly codes, for example:

- `CLOCK_ROLLBACK`
- `CLOCK_JUMP`
- `RUNTIME_DIGEST_MISMATCH`
- `PACKAGE_INTEGRITY_FAILURE`
- `ASSIGNMENT_SIGNATURE_FAILURE`
- `UNEXPECTED_NETWORK_ATTEMPT`
- `SESSION_RESET`
- `DUPLICATE_ASSIGNMENT_TOKEN` (detected when teacher imports multiple submissions)
- `ATTEMPT_LIMIT_EXCEEDED`
- `DEADLINE_CLOCK_UNTRUSTED`
- `RESULT_CHAIN_INVALID`

An anomaly is evidence for review, not automatic proof of cheating.

## 10. Result artifact

The learner returns one file, for example:

`assignment-name.p2lrn-result`

It is a ZIP/JSON-based artifact distinct from the course package and contains no executable code.

Minimum logical sections:

```text
result-manifest.json
assignment-proof.json
submission/
  state.json
  progression.json
  scores.json
  answers/...
analytics/
  events.jsonl
  active-time.json
audit/
  anomalies.json
  evidence-root.json
signature/
  result-signature.json
```

The result manifest binds:

- assignment ID;
- original package ID/contentRoot;
- runtime version/digest;
- opaque participant assignment token;
- attempt ID/number;
- started/finished observed times;
- elapsed monotonic duration;
- final score/completion summary;
- final evidence-chain root;
- hashes of every result payload.

> **Roadmap / future requirements:** sections 11–15 describe proposed verification and supervised operation. Only the capabilities explicitly marked as implemented above are currently available.

## 11. Teacher verification

Studio adds:

`Abrir -> Revisar entrega offline`

Before showing grades it verifies:

1. teacher/assignment signature;
2. assignment ID and expected course contentRoot;
3. returned result inventory/digests;
4. evidence-chain continuity;
5. runtime identity;
6. attempt/date/duration policy;
7. duplicate assignment token/attempt conflicts already imported;
8. anomaly list.

Review UI separates:

- `Integridad: valida / invalida`
- `Politica: cumplida / incidencias`
- `Nivel de confianza de plataforma`
- `Correccion y respuestas`
- `Metricas y cronologia`

A cryptographically valid result is not labelled `sin trampas`; it is labelled according to the evidence actually available.

## 12. Teacher authoring UI

The export dialog should remain simple:

- Entrega: `Autorreproducible offline`
- Seguridad: `Protegida (recomendada)` / `Universal`
- Disponible desde
- Fecha limite
- Tiempo maximo desde que empieza
- Intentos maximos
- Permitir continuar tras cerrar
- Asignar a alumno (optional opaque token)
- Incluir metricas de actividad (on by default for assessed delivery)
- Network: fixed to `Sin servicios externos` in protected mode
- Collaboration: fixed to `Desactivada`

Advanced security details stay collapsed unless the teacher asks for them.

## 13. Export validation

Studio refuses protected export when:

- package integrity fails;
- teacher signing key is unavailable when signing is required;
- a required collaborative/live capability has no offline fallback;
- a remote resource has no verified embedded/materializable fallback;
- a required runtime is not bundled/pinned;
- assignment policy is internally inconsistent.

## 14. Compatibility

This feature does not modify the `.p2lrn` Core package.

It composes existing mechanisms:

- Core package/contentRoot integrity;
- detached Ed25519 signature tooling;
- Player;
- Host Adapter v1;
- offline state/outbox concepts;
- Runtime Events v1;
- active-time tracking;
- progression state;
- package verification/cache;
- native activity state and scores.

The collaboration provider remains completely outside protected offline delivery.

## 15. Assurance levels

The UI and documentation MUST distinguish:

- `Portable`: convenient self-playing delivery; integrity checks, lowest anti-tamper assurance.
- `Protected offline`: signed launcher, pinned runtime, local policy enforcement, evidence chain, anomaly recording.
- `Verified connected`: optional trusted identity/time/server receipt for higher-stakes assessments.

No level should claim impossibility of cheating on a learner-controlled device.
