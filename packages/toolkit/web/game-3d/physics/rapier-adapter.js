import RAPIER from '../../vendor/rapier3d.mjs';

let readyPromise = null;

async function ready() {
  if (!readyPromise) readyPromise = RAPIER.init().then(() => RAPIER);
  return readyPromise;
}

export async function createRapierPhysicsWorld({gravity = [0,-9.81,0]} = {}) {
  const api = await ready();
  const world = new api.World({x:gravity[0],y:gravity[1],z:gravity[2]});
  const bodies = new Map();

  return {
    kind:'rapier',
    createGround({position=[0,-0.15,0], halfExtents=[12,0.15,12]}={}) {
      const body=world.createRigidBody(api.RigidBodyDesc.fixed().setTranslation(position[0],position[1],position[2]));
      const collider=api.ColliderDesc.cuboid(halfExtents[0],halfExtents[1],halfExtents[2]).setFriction(0.9);
      world.createCollider(collider,body);
      return body;
    },
    createBox({id,position=[0,1,0],halfExtents=[0.75,0.45,0.75],dynamic=true}={}) {
      const desc=(dynamic?api.RigidBodyDesc.dynamic():api.RigidBodyDesc.kinematicPositionBased())
        .setTranslation(position[0],position[1],position[2]);
      const body=world.createRigidBody(desc);
      const collider=api.ColliderDesc.cuboid(halfExtents[0],halfExtents[1],halfExtents[2])
        .setFriction(0.82)
        .setRestitution(0.08);
      world.createCollider(collider,body);
      bodies.set(String(id),body);
      return body;
    },
    setTranslation(id,position,{wake=true}={}) {
      const body=bodies.get(String(id));
      if (!body) return false;
      body.setTranslation({x:position[0],y:position[1],z:position[2]},wake);
      body.setLinvel({x:0,y:0,z:0},wake);
      body.setAngvel({x:0,y:0,z:0},wake);
      return true;
    },
    transform(id) {
      const body=bodies.get(String(id));
      if (!body) return null;
      return {translation:body.translation(),rotation:body.rotation()};
    },
    step(delta=1/60) {
      world.timestep=Math.max(1/240,Math.min(1/20,Number(delta)||1/60));
      world.step();
    },
    remove(id) {
      const key=String(id);
      const body=bodies.get(key);
      if (!body) return;
      world.removeRigidBody(body);
      bodies.delete(key);
    },
    destroy() {
      bodies.clear();
      world.free?.();
    },
  };
}
