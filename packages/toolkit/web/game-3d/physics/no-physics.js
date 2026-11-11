export async function createNoPhysicsWorld() {
  const bodies = new Map();
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||0));
  const confine=(state,position)=>({
    x:clamp(position[0],-12+state.halfExtents[0]+0.3,12-state.halfExtents[0]-0.3),
    y:Math.max(state.halfExtents[1],Number(position[1])||0),
    z:clamp(position[2],-13+state.halfExtents[2]+0.3,13-state.halfExtents[2]-0.3),
  });
  return {
    kind:'none',
    createGround(){ return null; },
    createBox({id, position = [0,0,0],halfExtents=[0.75,0.45,0.75],dynamic=true}) {
      const state={halfExtents,dynamic:Boolean(dynamic),translation:null,rotation:{x:0,y:0,z:0,w:1}};
      state.translation=confine(state,position);
      bodies.set(String(id),state);
      return state;
    },
    setTranslation(id, position) {
      const state=bodies.get(String(id));
      if (!state) return false;
      state.translation=confine(state,position);
      return true;
    },
    transform(id) { return bodies.get(String(id)) ?? null; },
    applyImpulse(id, impulse) {
      const state=bodies.get(String(id));
      if (!state||!state.dynamic) return false;
      state.translation=confine(state,[
        state.translation.x+(Number(impulse[0])||0)*0.08,
        state.translation.y+(Number(impulse[1])||0)*0.08,
        state.translation.z+(Number(impulse[2])||0)*0.08,
      ]);
      return true;
    },
    step(){},
    remove(id){ bodies.delete(String(id)); },
    destroy(){ bodies.clear(); },
  };
}
