> **Nota de migración P2LRN/Node:** este documento deriva de la especificación Alpha15 anterior. Las reglas de formato se conservan; cualquier referencia a la antigua implementación Python es histórica. La implementación principal actual es `@p2lrn/toolkit` en Node.js/TypeScript.

# AulaP2P course bridge - P2LRN 0.6.1

## Boundary

The bridge is an integration adapter between the existing AulaP2P canonical course contract and P2LRN:

```text
aulap2p.curso.v1
        <->
P2LRN Core 0.4.0 + AulaP2P extension
```

It is not a new AulaP2P course persistence model and must not bypass the canonical AulaP2P importer when integrated into the application.

## Input

`ingest-aulap2p-course` accepts either a raw `aulap2p.curso.v1` object or:

```json
{
  "schema": "p2lrn.aulap2p-course-envelope.v1",
  "course": {"version": "aulap2p.curso.v1"},
  "internalHosts": ["internal.example"],
  "assets": [],
  "qtiPackages": [],
  "tasks": []
}
```

`assets` and `qtiPackages` bind a canonical path to already materialized bytes. The P2LRN adapter does not fetch an AulaP2P internal URL to recover missing bytes.

## Portable identity

AulaP2P database IDs are not portable identity. The adapter strips `id`, `archivoId`, course/module/lesson/material/questionnaire/task foreign keys and other local persistence identifiers. Configured internal HTTP(S) hosts and localhost-style URLs are not emitted as portable resources.

When the bridge supplies a persistent `projectId`, portable P2LRN entity IDs remain stable for unchanged canonical paths. Otherwise the initial project identity is deterministically derived from the portable canonical course projection.

## Tasks

A professor-designed task is portable design state. A learner submission is not.

A task backed by AulaP2P `MaterialEjercicio + RecursoCurso + Tarea` is emitted as one P2LRN assignment activity. The backing material is not exported a second time as a separate normal material activity.

Portable task design fields are:

```text
titulo
descripcion
puntuacionMaxima
fechaEntrega
permiteRetraso
tituloVisible
obligatorio
positionKey
desbloqueadoEn
```

`positionKey` remains its own field; it is not converted into a second `orden` authority.

The task sidecar rejects learner/runtime/persistence state including student IDs, submissions, attempts, grades, feedback and local database/file identifiers.

## Assets and QTI

Materialized bytes are passed to the normal P2LRN builder, which stores them by SHA-256 under `assets/sha256/...` and inventories them in the single P2LRN manifest. QTI sidecars are represented through the QTI profile and remain separately identifiable during extraction.

Unmaterialized expected bytes are reported as transformation losses. External public URLs may be represented remotely; validation does not dereference them.

## Extraction

`extract-aulap2p-course` produces `p2lrn.aulap2p-course-import.v1` containing:

- the reconstructed `aulap2p.curso.v1` pedagogical structure;
- asset descriptors;
- QTI descriptors;
- task sidecars;
- portable identity information (`projectId`, `packageId`, `contentRoot`, portable entity IDs).

The receiving AulaP2P integration is responsible for materializing payload bytes into local storage, mapping portable IDs to local IDs and persisting through the existing canonical import transaction.

## Native questionnaire projection

The bridge reuses the existing AulaP2P questionnaire design instead of creating a second quiz model. For the seven currently supported AulaP2P question families, source-local IDs are used only while resolving source solutions and are replaced by portable activity-internal IDs in the emitted native representation.

If a QTI sidecar is materialized for the quiz, QTI stays authoritative and no parallel native representation is generated. Without QTI, the bridge attempts one `https://p2lrn.org/profile/native-questionnaire` representation on the existing quiz Activity. Mapping failure is recorded as an explicit loss and does not erase the canonical `aulap2p.curso.v1` extension.

The generated native representation is intentionally omitted from the extracted AulaP2P asset envelope, because it is a projection of the canonical quiz design rather than a new professor-uploaded file.
