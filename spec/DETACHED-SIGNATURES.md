> **Nota de migración P2LRN/Node:** este documento deriva de la especificación Alpha15 anterior. Las reglas de formato se conservan; cualquier referencia a la antigua implementación Python es histórica. La implementación principal actual es `@p2lrn/toolkit` en Node.js/TypeScript.

# P2LRN Detached Signatures - experimental v1

Status: implemented in the reference Toolkit 0.4.0a7 as a **detached** trust layer. It does not widen P2LRN Core 0.4.0 and it is not the final P2LRN signature profile.

## 1. Why detached

Core 0.4.0 reserves and rejects embedded signature payloads under the package signature namespace. Alpha 7 therefore does not modify the `.p2lrn` container to introduce a premature circular-signature contract.

A signature is a sibling sidecar:

```text
course.p2lrn
course.p2lrn.sig
```

The package remains a normal Core 0.4.0 artifact. Removing the sidecar does not alter the package; adding it does not change `contentRoot`.

## 2. Algorithm and key identity

The reference implementation uses Ed25519. The private key is never embedded in the package or signature envelope.

The public-key identifier is deterministic:

```text
urn:p2lrn:key:ed25519:sha256:<hex SHA-256 of the 32 raw public-key bytes>
```

The signature envelope includes the raw public key in base64url form so cryptographic validity can be checked without fetching a key from the network.

## 3. Signed statement

The signature is over RFC 8785/JCS canonical bytes of this logical statement:

```json
{
  "schema": "https://p2lrn.org/schema/detached-signature-input/1",
  "version": "1",
  "algorithm": "Ed25519",
  "keyId": "urn:p2lrn:key:ed25519:sha256:...",
  "target": {}
}
```

The compressed ZIP byte stream is deliberately not the semantic signature target.

Two target scopes are defined by the experimental tooling:

- `content` signs `format`, `formatVersion` and `contentRoot`; a packageId-only repackage does not invalidate it.
- `package` signs the same fields plus `packageId`; it binds one concrete package identity.

No current timestamp is silently injected into the signed statement. That keeps the signing input deterministic and avoids claiming timestamp authority that the format does not provide.

## 4. Cryptographic validity is not trust

A valid Ed25519 signature proves that the holder of the corresponding private key signed the declared target. It does **not** prove that the key belongs to a trusted publisher.

The reference verifier therefore reports these separately:

```text
cryptographicallyValid = true/false
trusted                = true/false
```

`trusted=true` is only produced when the exact public key is supplied by the host as a trusted key. `--require-trusted` fails closed when a signature is valid but its key is not in that supplied trust store.

Public-key governance, publisher identity, revocation, certificate chains/transparency and organization policy remain outside this experimental sidecar contract.

## 5. CLI

Install the Node.js/TypeScript toolkit. Ed25519 uses the Node crypto runtime and needs no Python trust extra:

```bash
npm install @p2lrn/toolkit
```

Generate a key pair:

```bash
p2lrn-trust keygen publisher-private.pem publisher-public.pem
```

Sign logical content:

```bash
p2lrn-trust sign course.p2lrn publisher-private.pem --scope content
```

Bind the concrete package identity instead:

```bash
p2lrn-trust sign course.p2lrn publisher-private.pem --scope package \
  --output course.p2lrn.sig
```

Verify cryptographically:

```bash
p2lrn-trust verify course.p2lrn course.p2lrn.sig
```

Verify and require a host-trusted key:

```bash
p2lrn-trust verify course.p2lrn course.p2lrn.sig \
  --trust-key publisher-public.pem \
  --require-trusted
```

The reference signer and verifier validate the `.p2lrn` package before using its manifest identity.

## 6. Security boundary

A trusted package signature does not automatically trust executable host code, remote URLs, renderer modules, component implementations or browser permissions. Those remain governed by the Reading System's host-side registries and permission policy.

Likewise, a signature is not an authorization token and carries no learner identity, enrolment, attempt or grade state.

## 7. Conformance boundary

`detached-signature/1` is an experimental Toolkit contract, not Core 0.4.0 conformance. A Core-only implementation may ignore the sibling `.sig` and still process the `.p2lrn` package normally.

Before a final signature profile is frozen, P2LRN still needs independent implementations and governance for trusted publisher identity, revocation and key rotation.
