# LTI 1.3 Host-Resolved Runtime

Status: host-rebound LTI delivery integration.

P2LRN packages may preserve portable external-tool intent, including imported Basic LTI links from Common Cartridge. They do not contain platform private keys, client secrets, access tokens or deployment credentials.

## Migration boundary

When a legacy Basic LTI resource is imported:

- its original Link URL is preserved as `targetLinkUri`;
- `sourceVersion` remains the actual source version;
- `rebindRequired=true` is preserved;
- it is not relabeled as an already-registered LTI 1.3 deployment.

The host/LMS must bind that intent to its own LTI 1.3 tool registration and deployment.

## Host Adapter

The Player calls:

`resolveRuntimeLaunch(request, context)`

with `runtime: "lti13"`, the target Link URL and preserved source metadata.

The host performs the platform-owned LTI work: registration lookup/rebinding, OIDC login initiation, signed LTI message construction, deployment/context/user claims and any Advantage services. It returns a prepared host-owned launch session:

```text
{
  protocol: "LTI-1.3",
  rebound: true,
  url: "https://platform.example/.../launch-session",
  presentation: "iframe" | "window"
}
```

The Player refuses launches which do not explicitly confirm `LTI-1.3` and `rebound: true`.

## Presentation

- `iframe`: sandboxed frame pointed at the host-prepared launch/session URL.
- `window`: explicit secure link with `target="_blank"` and `rel="noopener noreferrer"`.

The Player never falls back to launching a Basic LTI URL directly.

## Renderer

Renderer id:

`https://p2lrn.org/renderer/lti13/runtime`

Profile:

`https://p2lrn.org/profile/lti`

Only primary remote LTI intent is selected. The original cartridge/package is never selected as a tool launch surface.

## Gates

- `packages/toolkit/test/lti13-runtime.test.mjs`
- Common Cartridge Basic LTI regression in `packages/toolkit/test/external-standards.test.mjs`

These gates verify host rebind, protocol/presentation constraints, renderer selection, and source-intent preservation without secrets.

Full 1EdTech platform/tool certification remains outside package validation and requires the official LTI conformance tooling.
