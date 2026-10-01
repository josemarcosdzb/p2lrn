export function placeOrderedObject(placed, objectId, slotIndex) {
  const next = [...placed];
  if (!objectId) return {ok:false, placed:next, reason:'NO_OBJECT'};
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= next.length) {
    return {ok:false, placed:next, reason:'INVALID_SLOT'};
  }
  const occupied = next[slotIndex];
  if (occupied && occupied !== objectId) return {ok:false, placed:next, reason:'SLOT_OCCUPIED'};
  for (let index = 0; index < next.length; index += 1) if (next[index] === objectId) next[index] = null;
  next[slotIndex] = String(objectId);
  return {ok:true, placed:next};
}

export function removeOrderedObject(placed, objectId) {
  return placed.map((id) => id === objectId ? null : id);
}

export function orderingIsCorrect(placed, expected) {
  return placed.length === expected.length
    && placed.every((id, index) => id !== null && String(id) === String(expected[index]));
}

export function connectionKey(leftId, rightId) {
  return `${String(leftId)}\0${String(rightId)}`;
}

export function validateConnection(leftId, rightId, expected, existing = new Set()) {
  const key = connectionKey(leftId, rightId);
  if (!expected.has(key)) return {ok:false, reason:'INCORRECT_CONNECTION'};
  return {ok:true, alreadyExists:existing.has(key)};
}

export function appendUniqueConnection(connections, connection) {
  const key = connectionKey(connection.leftId, connection.rightId);
  if (connections.some((item) => connectionKey(item.leftId, item.rightId) === key)) return connections;
  return [...connections, {leftId:String(connection.leftId), rightId:String(connection.rightId)}];
}

export function assignClassification(classifications, itemId, categoryId, validItemIds, validCategoryIds) {
  const item = String(itemId ?? '');
  const category = String(categoryId ?? '');
  if (!validItemIds.has(item)) return {ok:false, classifications:{...classifications}, reason:'UNKNOWN_ITEM'};
  if (!validCategoryIds.has(category)) return {ok:false, classifications:{...classifications}, reason:'UNKNOWN_CATEGORY'};
  return {ok:true, classifications:{...classifications, [item]:category}};
}

export function classificationIsCorrect(classifications, expected) {
  const entries = expected instanceof Map ? [...expected.entries()] : Object.entries(expected ?? {});
  return entries.length > 0 && entries.every(([itemId, categoryId]) => String(classifications?.[itemId] ?? '') === String(categoryId));
}

export function reserveObject(ownership, objectId, actorId) {
  const current = ownership?.[objectId];
  if (current && current !== actorId) return {ok:false, ownership:{...ownership}, owner:current};
  return {ok:true, ownership:{...ownership, [objectId]:actorId}, owner:actorId};
}

export function releaseObject(ownership, objectId, actorId) {
  if (ownership?.[objectId] !== actorId) return {ok:false, ownership:{...ownership}};
  return {ok:true, ownership:{...ownership, [objectId]:null}};
}

export function releaseActorObjects(ownership, actorId) {
  return Object.fromEntries(Object.entries(ownership ?? {}).map(([objectId, owner]) => [
    objectId,
    owner === actorId ? null : owner,
  ]));
}
