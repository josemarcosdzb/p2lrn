export async function createNoPhysicsWorld() {
  const bodies = new Map();
  return {
    kind:'none',
    createGround(){ return null; },
    createBox({id, position = [0,0,0]}) {
      const state={translation:{x:position[0],y:position[1],z:position[2]},rotation:{x:0,y:0,z:0,w:1}};
      bodies.set(String(id),state);
      return state;
    },
    setTranslation(id, position) {
      const state=bodies.get(String(id));
      if (!state) return false;
      state.translation={x:position[0],y:position[1],z:position[2]};
      return true;
    },
    transform(id) { return bodies.get(String(id)) ?? null; },
    step(){},
    remove(id){ bodies.delete(String(id)); },
    destroy(){ bodies.clear(); },
  };
}
