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

// Shared physical drop contract for ordering and classification 3D.
// An unsuccessful drop never resets the mesh or changes the graded answer.
// The final free pose survives changing trials and reopening the activity.
export function validLoose3DPosition(position){
  return Array.isArray(position)&&position.length===3&&
    position.every(Number.isFinite)&&
    Math.abs(position[0])<=12.5&&position[1]>=-0.5&&position[1]<=25&&
    Math.abs(position[2])<=13.5;
}

export function createLooseDropState({scene,runtime,storageKey,staging,objectId}){
  const stored=runtime.getGameState(storageKey,null);
  const loose=new Map();
  for(const [id] of staging){
    const saved=stored&&Object.hasOwn(stored,id)?stored[id]:null;
    if(validLoose3DPosition(saved))loose.set(id,[...saved]);
  }
  const position=(id)=>loose.get(id)??staging.get(id)??null;
  const current=(id)=>{
    const live=scene.getTranslation?.(objectId(id));
    return validLoose3DPosition(live)?[...live]:position(id);
  };
  const persist=()=>runtime.setGameState(storageKey,Object.fromEntries(loose));
  const remember=(id,pose=null)=>{
    if(!staging.has(id))return false;
    const next=validLoose3DPosition(pose)?pose:current(id);
    if(!validLoose3DPosition(next))return false;
    loose.set(id,[...next]);persist();return true;
  };
  const forget=(id)=>{
    loose.delete(id);persist();
  };
  const start=(id,pointer)=>{
    const original=current(id);
    if(!validLoose3DPosition(original))return null;
    return {id,last:[...original],
      offset:validLoose3DPosition(pointer)?original.map((v,i)=>v-pointer[i]):[0,0,0]};
  };
  const move=(drag,pointer)=>{
    if(!drag||!validLoose3DPosition(pointer))return false;
    const next=pointer.map((value,index)=>value+drag.offset[index]);
    if(!validLoose3DPosition(next))return false;
    if(!scene.setTranslation(objectId(drag.id),next))return false;
    drag.last=[...next];
    return true;
  };
  const end=(drag,pointer=null)=>{
    if(!drag)return false;
    if(pointer)move(drag,pointer);
    // Keep the pointer's final valid location. Rapier may settle the Y value
    // on the next frame, but X/Z must remain at the released coordinates.
    return remember(drag.id,drag.last);
  };
  return {position,current,remember,forget,start,move,end};
}
