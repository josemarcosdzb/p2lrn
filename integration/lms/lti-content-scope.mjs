// LTI authorizations are scoped to the explicitly linked course, unit or
// activity and its transitive children, never to sibling graph entities.
export function deriveLtiContentScope(entities,rootId){
 if(!Array.isArray(entities)||entities.length>50000||
    typeof rootId!=='string'||!rootId)
  throw new Error('UNAUTHORIZED_PLAYER_CONTEXT');
 const byId=new Map();
 for(const entity of entities){
  if(typeof entity?.id!=='string'||byId.has(entity.id))
   throw new Error('INVALID_P2LRN_GRAPH');
  byId.set(entity.id,entity);
 }
 if(!byId.has(rootId)||
    !['course','unit','activity'].includes(byId.get(rootId).type))
  throw new Error('UNAUTHORIZED_PLAYER_CONTEXT');
 const visited=new Set(),authorized=new Set(),pending=[rootId];
 while(pending.length){
  const id=pending.pop();
  if(visited.has(id))continue;
  visited.add(id);
  const entity=byId.get(id);
  if(!entity)throw new Error('INVALID_P2LRN_GRAPH');
  if(['course','unit','activity'].includes(entity.type))authorized.add(id);
  for(const child of entity.children||[]){
   if(!byId.has(child))throw new Error('INVALID_P2LRN_GRAPH');
   if(!visited.has(child))pending.push(child);
  }
 }
 return authorized;
}
