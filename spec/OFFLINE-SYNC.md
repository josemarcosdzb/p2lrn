# P2LRN Offline Host Adapter v1

Status: experimental Reading-System contract. Offline synchronization is runtime/host state; it is not stored as learner history inside the `.p2lrn` package.

## Compatibility model

`createOfflineHostAdapter()` wraps an existing Host Adapter v1. The Player still sees the same five Host Adapter callbacks: `loadState`, `saveState`, `reportScore`, `emitEvent` and `resolveResourceUrl`.

No Core 0.4.0 package change is required.

## Local state and outbox

The adapter does not persist learner state to a shared browser database implicitly. Without an explicit store/partition it uses an in-memory store. A host that wants persistence supplies `storageNamespace` or an explicit `createIndexedDbOfflineStore({namespace})`; that opaque namespace must partition learners/sessions outside the package identity.

- `saveState`: writes the latest resume snapshot locally first. Pending snapshots for the same P2LRN context are coalesced to the newest snapshot.
- `emitEvent`: queued individually and replayed in order.
- `reportScore`: queued individually.
- `loadState`: can resume from the local snapshot while offline.
- `resolveResourceUrl`: is never queued; a remote resource is either available now or it is not.

The default IndexedDB database name is `p2lrn-runtime-v1`, but records are isolated by the host-supplied namespace. `clearLocal()` removes the current local partition and should be used when host policy requires cleanup (for example logout on a shared device).

## ACK and retry

An outbox item is removed only after the corresponding remote Host Adapter callback resolves successfully. A rejected callback leaves the item pending. Replay stops on the first failure so later ordered events are not acknowledged ahead of a failed predecessor. If an outbox already contains pending work, newly generated state/score/event writes are queued even after connectivity returns; they do not bypass older operations.

This is at-least-once delivery across ambiguous network failures, not an exactly-once protocol. If a server commits an event and the response is lost, a later retry can duplicate it unless the host implements idempotency. Exact-once semantics require a server protocol with durable operation IDs/ACK state and are intentionally not claimed by Host Adapter v1.

For every state/score/event write, the offline wrapper adds two non-secret fields to the existing Host Adapter context: `offlineDeliveryId` and `offlineQueuedAt`. The same values are reused if a direct send fails ambiguously and the operation is later replayed. Hosts should persist/deduplicate by `offlineDeliveryId` when they need exactly-once effects. This keeps Host Adapter v1 source-compatible while giving the server a stable idempotency key.

## Conflict handling

State formats can be opaque and profile-specific (for example SCORM CMI state), so the runtime does not generically merge two different device snapshots.

Applications that support multi-device reconciliation may provide `conflictResolver({local, remote, context, direction})`. Without one, a locally pending state remains authoritative for that offline continuation until it is pushed; the runtime does not invent field-level merge rules.

Authoritative grades, attempt ownership and learner identity remain server concerns.

## Example

```js
const remote = P2LRN.createHostAdapter({
  loadState: loadFromServer,
  saveState: saveToServer,
  reportScore: reportToServer,
  emitEvent: appendEvent
});

const offline = P2LRN.createOfflineHostAdapter({
  remote,
  storageNamespace: opaqueLearnerPartition
});
player.adapter = offline;

// When connectivity is restored or at a host-chosen synchronization point:
await offline.sync();
```

Manual `sync()` remains supported and deterministic. Hosts that want automatic reconnection may opt into `createOfflineSyncController({adapter})`. The controller listens to host `online`/`offline` lifecycle events, preserves ordered outbox semantics and retries pending work with bounded exponential backoff. It does not create an OS scheduler, service account or background process; it exists only while the host runtime is alive.

Hosts may still call `syncNow()` at explicit checkpoints and `stop()` during logout/unmount.

## Local verified resource fallback

`createOfflineHostAdapter()` may receive a trusted `resourceResolver`. Resolution is attempted locally before the remote Host Adapter. This allows digest-pinned resources that were previously verified and cached to stay available while disconnected without changing Host Adapter v1.