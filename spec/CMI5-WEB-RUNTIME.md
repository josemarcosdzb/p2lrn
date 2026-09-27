# cmi5 Web Runtime

Status: host-resolved cmi5 launch integration.

P2LRN preserves cmi5 course/block/AU structure and delegates cmi5/xAPI session authority to the LMS/host. Authentication material and one-time Fetch URLs are never stored inside a P2LRN package.

## Host Adapter contract

The Player calls optional Host Adapter callback:

`resolveRuntimeLaunch(request, context)`

For a cmi5 AU, the request includes:

- source representation location;
- source AU id;
- `moveOn`;
- `masteryScore`;
- `launchMethod`;
- source launch parameters;
- entitlement key where present.

The host is responsible for authenticating/authorizing the learner, creating or resuming the registration/session, preparing cmi5 State/Profile data, issuing the LMS-side Launched statement when required, and returning a launch URL.

The returned URL must contain the cmi5 launch parameters:

- `endpoint`;
- `fetch`;
- `actor`;
- `registration`;
- `activityId`.

The Player validates the contract before navigating.

## Launch methods

- `AnyWindow`: rendered in a sandboxed iframe.
- `OwnWindow`: presented as an explicit learner action which opens a top-level browser window.

The renderer never places cmi5 authorization data in the P2LRN graph or manifest.

## Authoritative completion

A host may return a `completion` Promise with the resolved launch. This is intended for the LMS/LRS integration to resolve after authoritative cmi5 session processing. When it resolves, the Player surfaces P2LRN score/completion events as authoritative host results.

The Player does not infer cmi5 credit merely from iframe load, page navigation, or arbitrary content messages.

## Renderer

Renderer id:

`https://p2lrn.org/renderer/cmi5/runtime`

Only `primary` cmi5 representations are launchable. The preserved original package is never selected as a launch surface.

## Gates

`packages/toolkit/test/cmi5-runtime.test.mjs` verifies:

- required launch URL parameters;
- account IFI shape;
- registration UUID;
- HTTP(S) endpoint/fetch restrictions;
- AnyWindow/OwnWindow;
- Host Adapter callback exposure;
- renderer selection for remote/package-member primary AUs;
- refusal to use the original package as a launch surface.

A complete reference LMS/LRS implementation remains separate from the portable Player and is still required to close full end-to-end cmi5 conformance.
