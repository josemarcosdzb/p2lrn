export const COLLABORATION_CAPABILITY = 'collaboration.room';
export const COLLABORATION_OPERATIONS = Object.freeze(['join','send','listen','snapshot','leave']);

const MAX_EVENTS = 2000;
const MAX_EVENT_BYTES = 64 * 1024;
const MAX_ROOM_LENGTH = 128;
const EVENT_TYPE = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function roomName(value) {
  const room = String(value ?? 'main').trim() || 'main';
  if (room.length > MAX_ROOM_LENGTH || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(room)) {
    throw new TypeError('Collaboration room must be a short portable identifier.');
  }
  return room;
}

function eventType(value) {
  const type = String(value ?? '').trim();
  if (!EVENT_TYPE.test(type) || type.length > 96) throw new TypeError('Collaboration event type is invalid.');
  return type;
}

function payloadObject(value) {
  const payload = value == null ? {} : clone(value);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new TypeError('Collaboration payload must be an object.');
  if (JSON.stringify(payload).length > MAX_EVENT_BYTES) throw new TypeError('Collaboration payload is too large.');
  return payload;
}

function scopeKey(context, room) {
  const root = String(context?.contentRoot ?? context?.packageId ?? 'package');
  const entity = String(context?.entityId ?? 'entity');
  return root + '\u0000' + entity + '\u0000' + room;
}

function opaqueId(prefix) {
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
  return prefix + random;
}

export function createMemoryCollaborationHub({maxEvents = MAX_EVENTS, clock = () => Date.now()} = {}) {
  const limit = Math.max(50, Math.min(10000, Number(maxEvents) || MAX_EVENTS));
  const rooms = new Map();
  const sessions = new Map();

  function getRoom(key) {
    let room = rooms.get(key);
    if (!room) {
      room = {revision:0, participants:new Map(), events:[]};
      rooms.set(key, room);
    }
    return room;
  }

  function requireSession(input, context) {
    const sessionId = String(input?.sessionId ?? '');
    const session = sessions.get(sessionId);
    if (!session) {
      const error = new Error('P2LRN collaboration session is not joined.');
      error.code = 'P2LRN_COLLABORATION_SESSION_REQUIRED';
      throw error;
    }
    if (session.scope !== scopeKey(context, session.room)) {
      const error = new Error('P2LRN collaboration session does not belong to this activity.');
      error.code = 'P2LRN_COLLABORATION_SCOPE_MISMATCH';
      throw error;
    }
    return {sessionId, session, room:getRoom(session.scope)};
  }

  function provider({participantId = null} = {}) {
    const participant = String(participantId ?? opaqueId('participant-')).trim();
    if (!participant || participant.length > 256) throw new TypeError('Collaboration participant id is invalid.');
    return Object.freeze({
      id: COLLABORATION_CAPABILITY,
      operations: COLLABORATION_OPERATIONS,
      async invoke(operation, input = {}, context = {}) {
        if (!COLLABORATION_OPERATIONS.includes(operation)) {
          const error = new Error('Unsupported P2LRN collaboration operation: ' + operation);
          error.code = 'P2LRN_CAPABILITY_UNAVAILABLE';
          throw error;
        }
        if (operation === 'join') {
          const room = roomName(input.room);
          const scope = scopeKey(context, room);
          const state = getRoom(scope);
          const sessionId = opaqueId('session-');
          sessions.set(sessionId,{scope,room,participantId:participant});
          state.participants.set(sessionId, participant);
          return {sessionId, participantId:participant, revision:state.revision, presence:state.participants.size};
        }
        const current = requireSession(input, context);
        if (operation === 'leave') {
          current.room.participants.delete(current.sessionId);
          sessions.delete(current.sessionId);
          return {left:true, revision:current.room.revision, presence:current.room.participants.size};
        }
        if (operation === 'send') {
          const type = eventType(input.type);
          const payload = payloadObject(input.payload);
          current.room.revision += 1;
          const event = Object.freeze({
            revision:current.room.revision,
            type,
            participantId:current.session.participantId,
            timestamp:new Date(Number(clock())).toISOString(),
            payload,
          });
          current.room.events.push(event);
          if (current.room.events.length > limit) current.room.events.splice(0,current.room.events.length-limit);
          return {revision:current.room.revision, presence:current.room.participants.size, event:clone(event)};
        }
        if (operation === 'snapshot') {
          return {
            revision:current.room.revision,
            presence:current.room.participants.size,
            events:clone(current.room.events),
          };
        }
        const cursor = Math.max(0, Number(input.cursor) || 0);
        const events = current.room.events.filter((event)=>event.revision > cursor).slice(0,200);
        return {
          revision:current.room.revision,
          presence:current.room.participants.size,
          events:clone(events),
          hasMore:events.length === 200 && events.at(-1)?.revision < current.room.revision,
        };
      },
    });
  }

  return Object.freeze({
    provider,
    inspect() {
      return [...rooms.entries()].map(([scope,room])=>({
        scope,
        revision:room.revision,
        presence:room.participants.size,
        events:clone(room.events),
      }));
    },
  });
}
