# P2LRN Offline Assignment / Self-Playing Delivery

Status: design contract for an additive Reading-System/export mode. It does not change P2LRN Core 0.4.0 and does not create a second course graph or a collaboration transport.

## 1. Goal

A teacher can export an existing `.p2lrn` as a self-playing offline assignment. A learner double-clicks the delivery, it opens in a browser, the learner completes it without an LMS, and the learner returns one result artifact to the teacher.

The teacher can then open the returned artifact in Studio/Review to inspect answers, score, progression, attempts, active time and the supported analytics/audit trail.

The same course package remains authoritative. The offline delivery adds a trusted launcher/runtime envelope and an assignment policy around it.

## 2. Security claim

A fully offline assessment executed on a computer controlled by the learner cannot be mathematically cheat-proof. A learner with administrator/root control can ultimately modify software, clocks, memory or the operating system.

P2LRN MUST therefore make a narrower and defensible claim:

- package and policy tampering are cryptographically detectable;
- post-hoc editing of a normal returned result is detectable;
- runtime/package/version mismatches are detectable;
- clock discontinuities, resets, duplicate assignment tokens and abnormal session transitions are recorded;
- the launcher fails closed on invalid teacher signatures or changed package/runtime bytes;
- collaboration and remote live capabilities are unavailable in protected offline mode;
- high-stakes absolute-time or identity guarantees require an external trusted authority and MUST NOT be falsely claimed by an offline-only export.

The protected launcher raises the cost of manipulation; it does not claim that a learner-controlled machine is a trusted examination appliance.

## 3. Export modes

Studio exposes one export surface:

`Exportar -> Entrega offline / autorreproducible`

with two implementations sharing the same assignment format.

### Universal self-playing

A portable self-playing delivery for low/medium-stakes work. It may be a single HTML delivery or a portable folder/launcher depending on browser restrictions.

It is convenient but MUST be labelled as tamper-evident rather than high-assurance.

### Protected offline delivery

**Planned protected mode (not yet delivered):** recommended for assessed work needing strong authenticity, with a signed launcher and verified teacher signature. The current Windows delivery is an unsigned `.p2lrn-offline.cmd` with embedded ZIP SHA-256 verification; the portable ZIP has a CMD launcher after extraction. Both are suitable for ordinary offline learning but are not authenticated examination applications. Equivalent signed launchers can be developed for other platforms without changing the P2LRN course or result schemas.

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

**Required for future protected mode:** the assignment statement should be Ed25519-signed by a trusted teacher/exporter key, reusing existing detached-signature primitives. **Current implementation:** portable Windows CMD/ZIP verifies the embedded ZIP's SHA-256 but does not provide a trusted Ed25519 assignment signature. A learner can recompute an unkeyed result digest after altering a result; treat current integrity as corruption detection, not proof of authorship or cheating resistance.

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
