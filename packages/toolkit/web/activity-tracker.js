export const DEFAULT_ACTIVITY_IDLE_AFTER_MS = 60_000;

function defaultNow() { return globalThis.performance?.now?.() ?? Date.now(); }
function emitSafely(callback,type,payload){try{callback(type,Object.freeze({...payload}));}catch{}}

export function createActivityTracker({
  target = globalThis.document ?? null,
  focusTarget = globalThis.window ?? target,
  interactionTarget = target,
  idleAfterMs = DEFAULT_ACTIVITY_IDLE_AFTER_MS,
  now = defaultNow,
  onEvent = () => {},
  setTimer = globalThis.setTimeout?.bind(globalThis),
  clearTimer = globalThis.clearTimeout?.bind(globalThis),
} = {}) {
  if (!target || typeof target.addEventListener !== 'function' || typeof target.removeEventListener !== 'function') throw new TypeError('Activity tracker requires an EventTarget-like document.');
  if (!focusTarget || typeof focusTarget.addEventListener !== 'function' || typeof focusTarget.removeEventListener !== 'function') throw new TypeError('Activity tracker focusTarget must be EventTarget-like.');
  if (!interactionTarget || typeof interactionTarget.addEventListener !== 'function' || typeof interactionTarget.removeEventListener !== 'function') throw new TypeError('Activity tracker interactionTarget must be EventTarget-like.');
  if (!Number.isFinite(idleAfterMs) || idleAfterMs <= 0) throw new TypeError('idleAfterMs must be a positive finite number.');
  if (typeof now !== 'function' || typeof onEvent !== 'function' || typeof setTimer !== 'function' || typeof clearTimer !== 'function') throw new TypeError('Invalid activity tracker callback configuration.');

  let stopped=false,timer=null,idle=false;
  let visible=target.visibilityState !== 'hidden';
  let focused=typeof target.hasFocus === 'function' ? Boolean(target.hasFocus()) : true;
  let lastInteraction=Number(now());
  let activeStarted=null,totalActiveMs=0;
  const listeners=[];

  const active=()=>visible&&focused&&!idle&&!stopped;
  const snapshot=(reason)=>Object.freeze({active:active(),visible,focused,idle,reason,totalActiveMs:Math.max(0,Math.round(totalActiveMs))});
  function closeActive(t){if(activeStarted!=null){totalActiveMs+=Math.max(0,t-activeStarted);activeStarted=null;}}
  function openActive(t){if(active()&&activeStarted==null)activeStarted=t;}
  function transition(reason){const t=Number(now());closeActive(t);openActive(t);emitSafely(onEvent,'p2lrn:attention',snapshot(reason));}
  function scheduleIdle(){
    if(timer!=null)clearTimer(timer);
    const delay=Math.max(0,idleAfterMs-(Number(now())-lastInteraction));
    timer=setTimer(()=>{timer=null;if(stopped)return;const elapsed=Number(now())-lastInteraction;if(elapsed>=idleAfterMs&&!idle){const t=Number(now());closeActive(t);idle=true;emitSafely(onEvent,'p2lrn:attention',snapshot('idle'));}else scheduleIdle();},delay);
  }
  function interact(){
    if(stopped)return;
    const t=Number(now());lastInteraction=t;
    if(idle){idle=false;openActive(t);emitSafely(onEvent,'p2lrn:attention',snapshot('interaction'));}
    scheduleIdle();
  }
  function visibility(){const next=target.visibilityState!=='hidden';if(next===visible)return;const t=Number(now());closeActive(t);visible=next;openActive(t);emitSafely(onEvent,'p2lrn:attention',snapshot(next?'visible':'hidden'));}
  function focus(){if(focused)return;const t=Number(now());focused=true;openActive(t);emitSafely(onEvent,'p2lrn:attention',snapshot('focus'));}
  function blur(){if(!focused)return;const t=Number(now());closeActive(t);focused=false;emitSafely(onEvent,'p2lrn:attention',snapshot('blur'));}
  function listen(source,type,handler,options){source.addEventListener(type,handler,options);listeners.push([source,type,handler,options]);}

  listen(target,'visibilitychange',visibility);
  listen(focusTarget,'focus',focus,true);
  listen(focusTarget,'blur',blur,true);
  for(const type of ['pointerdown','keydown','touchstart','wheel'])listen(interactionTarget,type,interact,{capture:true,passive:true});
  openActive(Number(now()));
  scheduleIdle();
  emitSafely(onEvent,'p2lrn:attention',snapshot(active()?'start':'start-inactive'));

  return Object.freeze({
    snapshot(){const t=Number(now());const total=totalActiveMs+(activeStarted==null?0:Math.max(0,t-activeStarted));return Object.freeze({active:active(),visible,focused,idle,totalActiveMs:Math.max(0,Math.round(total)),idleAfterMs});},
    markInteraction:interact,
    stop(){
      if(stopped)return this.snapshot();
      const t=Number(now());closeActive(t);stopped=true;if(timer!=null){clearTimer(timer);timer=null;}
      for(const [source,type,handler,options] of listeners)source.removeEventListener(type,handler,options);
      const result=Object.freeze({active:false,visible,focused,idle,totalActiveMs:Math.max(0,Math.round(totalActiveMs)),idleAfterMs});
      emitSafely(onEvent,'p2lrn:active-time',{...result,reason:'stop'});return result;
    },
  });
}