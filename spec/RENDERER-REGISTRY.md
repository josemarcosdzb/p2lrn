> **Nota de migración P2LRN/Node:** este documento deriva de la especificación Alpha15 anterior. Las reglas de formato se conservan; cualquier referencia a la antigua implementación Python es histórica. La implementación principal actual es `@p2lrn/toolkit` en Node.js/TypeScript.

# P2LRN Renderer Registry - modular runtime contract alpha 5

Status: experimental Reading-System contract. It does **not** widen P2LRN Core 0.4.0.

## 1. Goal

A `.p2lrn` carries portable educational content. It does not need to carry a copy of the player, every game renderer or large graphics libraries. A Reading System installs trusted renderers once and selects them at playback time.

```text
.p2lrn content -> Renderer Registry -> one compatible installed renderer -> DOM / Canvas / WebGL
```

The registry is host/runtime behavior, not learner state and not an executable payload stored in every package.

## 2. Renderer identity

A renderer has an absolute URI identifier, a renderer implementation version, representation matching rules and optional host dependencies/permissions.

The reference registry currently ships these questionnaire renderers:

- `https://p2lrn.org/renderer/questionnaire/standard`
- `https://p2lrn.org/renderer/questionnaire/memory`
- `https://p2lrn.org/renderer/questionnaire/matching`
- `https://p2lrn.org/renderer/questionnaire/ordering`
- `https://p2lrn.org/renderer/questionnaire/true-false`
- `https://p2lrn.org/renderer/questionnaire/word-search`
- `https://p2lrn.org/renderer/questionnaire/crossword`
- `https://p2lrn.org/renderer/questionnaire/rosco`
- `https://p2lrn.org/renderer/questionnaire/3d-order-match`

Passive text, browser media, the native composite runtime and the native-component router also use registry entries instead of hardcoded player branches. The composite renderer recursively asks the same registry to render child Activities; it does not ship a private renderer stack.

Native component implementation renderers may be marked `selectable: false`. Such renderers cannot be selected by package renderer hints or the HTML `renderer` attribute. Only trusted host code such as the Component Registry may resolve/load them after component compatibility checks. This prevents package metadata from bypassing component version/migration policy.

## 3. Declarative preference extension

An Activity or Resource MAY carry the extension:

`https://p2lrn.org/ext/renderer-preference/1`

Example:

```json
{
  "https://p2lrn.org/ext/renderer-preference/1": {
    "preferred": "https://p2lrn.org/renderer/questionnaire/memory",
    "version": "1",
    "alternatives": [
      "https://p2lrn.org/renderer/questionnaire/standard"
    ],
    "required": false
  }
}
```

`version` is an optional exact renderer-contract version for `preferred`. A mismatch behaves like an unavailable optional renderer, or fails when `required` is true. `preferred` is a hint unless `required` is true. If an optional preferred renderer is absent, incompatible, lacks a host dependency or is denied a permission, the Reading System may fall back to another compatible renderer. A required renderer must fail explicitly rather than silently substitute another presentation.

The HTML `renderer="..."` attribute is an explicit host request and is therefore strict.

## 4. Full-content fidelity rule

Alternative renderers MUST NOT silently select only convenient questions. A questionnaire game is compatible only if it can represent the complete canonical questionnaire according to the renderer's declared transformation rules.

The reference 2D/3D game adapters reuse this rule from the existing AulaP2P Quest implementation. Incompatible questions produce an explicit incompatibility result and optional renderer hints fall back to the standard renderer.

## 5. Lazy loading

Renderer descriptors contain a host-side `load()` function. The reference Web Component imports a module only after registry selection. Consequently:

- loading `p2lrn-player.js` does not load the questionnaire UI runtime;
- opening a standard questionnaire does not load game renderers;
- opening a 2D game does not load the 3D module;
- WebGL is checked only for the 3D renderer;
- loaded ES modules are then reusable through normal browser module caching.

## 6. Dependencies and permissions

The reference `DependencyRegistry` provides host capabilities such as DOM, Canvas 2D and WebGL2. Renderer code can depend on registered host capabilities, but package content cannot supply arbitrary dependency URLs for automatic execution.

A renderer can also declare permissions. The registry denies declared permissions unless the host permission policy explicitly allows them. Built-in alpha renderers require no privileged permission. This boundary is intentionally conservative: a package renderer hint cannot grant camera, microphone, network or similar capability by itself.

## 7. Host extension API

Trusted host software may install renderers/dependencies before playback:

```js
P2LRN.registerDependency({...});
P2LRN.registerRenderer({...});
P2LRN.setPermissionPolicy((permission, context) => false);
P2LRN.registerComponent({...});
```

This API is for trusted host integration. It is not an instruction to execute JavaScript embedded by an untrusted `.p2lrn` package.

## 8. Same canonical state

Alternative questionnaire renderers write to the same portable questionnaire answer/state model and emit the same P2LRN events. Alpha 4 wraps those events in the versioned `runtime-event/1` envelope while retaining backwards-compatible DOM event detail fields; see `RUNTIME-EVENTS.md`. Switching presentation must not create a second source of truth for questions, answers or scoring.
