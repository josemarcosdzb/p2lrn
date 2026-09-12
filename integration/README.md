# `.p2lrn` file association

The format never embeds executable reader code inside each course. Install one P2LRN Reading System and associate `.p2lrn` with it.

- Linux templates are under `integration/linux/`.
- The Windows helper registers the association only for the current user. Review it before running it.
- A native macOS application bundle/UTType declaration is intentionally left for the packaged desktop reader rather than faking it in the Core format.

The media type `application/vnd.p2lrn+zip` is still an experimental candidate until formal registration.


## Web embedding

The same separation applies on the web. Alpha 11 adds a generated Web SDK around the same trusted runtime, so a plain host can load one classic script:

```html
<script src="/p2lrn-sdk/p2lrn.js"></script>
```

An ESM/npm host can instead `import "@p2lrn/player"`. Both forms use the same generated `dist/` tree and register the same `<p2lrn-player>` implementation.

Pages then embed one or many packages without copying the runtime into them:

```html
<p2lrn-player src="/courses/a.p2lrn"></p2lrn-player>
<p2lrn-player src="/courses/b.p2lrn"></p2lrn-player>
```

Renderer modules are selected and lazy-loaded by the installed player.


## Host Adapter v1

Platforms that need persistence/analytics can register one trusted adapter on the player instead of embedding platform code into every package:

```js
player.adapter = P2LRN.createHostAdapter({
  loadState: async (context) => null,
  saveState: async (state, context) => {},
  reportScore: async (score, context) => {},
  emitEvent: async (event, context) => {},
  resolveResourceUrl: async (request, context) => null
});
```

The adapter is host code. A `.p2lrn` cannot provide callback code, credentials or an event-upload endpoint. Composite and questionnaire runtimes use the same contract.


## Host component implementations

Trusted hosts may install reusable native components once with `P2LRN.registerComponent(...)` plus their internal renderer registration. `.p2lrn` packages only name the component/version and carry its authored data; they cannot provide implementation module URLs or grant permissions.

## Plain static hosting and seekable media

A same-origin static site can opt into the Alpha-10 browser bridge without embedding runtime code in each package. Serve the standalone worker at a URL whose scope contains both the page and the virtual-resource namespace, then install it explicitly once:

```html
<script type="module">
  import {installP2LRNServiceWorker} from "/p2lrn/static-resource-bridge.js";
  await installP2LRNServiceWorker({url: "/p2lrn-sw.js", scope: "/"});
  await import("/p2lrn/p2lrn-player.js");
</script>

<p2lrn-player src="/courses/course.p2lrn"></p2lrn-player>
```

The installer never silently replaces a different Service Worker already controlling that scope. If an application already owns the root scope, integrate the P2LRN static-bridge message/fetch protocol into that worker instead. Packages without `org.p2lrn.rangeIntegrity` remain compatible, but large media from those older packages falls back to the existing verified Blob/host bridge path instead of being advertised as cryptographically verified random seek.

See `spec/STATIC-BROWSER-BRIDGE.md` and `examples/static-host-bridge.html`.
