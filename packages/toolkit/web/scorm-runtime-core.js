export const SCORM_PROFILE = 'https://p2lrn.org/profile/scorm';
export const SCORM_STATE_SCHEMA = 'https://p2lrn.org/schema/scorm-runtime-state/1';
export const SCORM_RUNTIME_PROTOCOL = 'p2lrn-scorm-runtime/1';
export const LEGACY_SCORM_RUNTIME_PROTOCOL = 'p2rln-scorm-runtime/1';
export function isScormRuntimeProtocol(value) {
  return value === SCORM_RUNTIME_PROTOCOL || value === LEGACY_SCORM_RUNTIME_PROTOCOL;
}

export function normalizeScormVersion(value) {
  return String(value ?? '').toLowerCase().includes('2004') ? '2004' : '1.2';
}

// Kept intentionally self-contained: the fallback renderer serializes this
// function into an isolated srcdoc shell. The CMI rules below are adapted from
// AulaP2P's proven SCORM CMI model instead of maintaining a second rule set.
export function createScormApi(options = {}) {
  const version = String(options.version ?? '').toLowerCase().includes('2004') ? '2004' : '1.2';
  const is2004 = version === '2004';

  const STATUS_12 = ['passed','completed','failed','incomplete','browsed','not attempted'];
  const EXIT_12 = ['','time-out','suspend','logout'];
  const COMPLETION_2004 = ['completed','incomplete','not attempted','unknown'];
  const SUCCESS_2004 = ['passed','failed','unknown'];
  const EXIT_2004 = ['time-out','suspend','logout','normal',''];
  const INTERACTION_TYPES_12 = ['true-false','choice','fill-in','matching','performance','likert','sequencing','numeric'];
  const INTERACTION_TYPES_2004 = ['true-false','choice','fill-in','long-fill-in','matching','performance','likert','sequencing','numeric','other'];
  const RESULT_12 = ['correct','wrong','unanticipated','neutral'];
  const RESULT_2004 = ['correct','incorrect','unanticipated','neutral'];

  const RULES_12 = {
    'cmi.core._children': {kind:'string', readOnly:true},
    'cmi.core.student_id': {kind:'string', readOnly:true},
    'cmi.core.student_name': {kind:'string', readOnly:true},
    'cmi.core.lesson_location': {kind:'string', maxLength:255},
    'cmi.core.credit': {kind:'string', readOnly:true},
    'cmi.core.lesson_status': {kind:'status12', allowed:STATUS_12},
    'cmi.core.entry': {kind:'string', readOnly:true},
    'cmi.core.score._children': {kind:'string', readOnly:true},
    'cmi.core.score.raw': {kind:'number'},
    'cmi.core.score.max': {kind:'number'},
    'cmi.core.score.min': {kind:'number'},
    'cmi.core.total_time': {kind:'timeinterval12', readOnly:true},
    'cmi.core.lesson_mode': {kind:'string', readOnly:true},
    'cmi.core.exit': {kind:'exit12', allowed:EXIT_12},
    'cmi.core.session_time': {kind:'timeinterval12'},
    'cmi.suspend_data': {kind:'string', maxLength:4096},
    'cmi.launch_data': {kind:'string', readOnly:true},
    'cmi.comments': {kind:'string', maxLength:4096},
    'cmi.comments_from_lms': {kind:'string', readOnly:true},
    'cmi.student_data._children': {kind:'string', readOnly:true},
    'cmi.student_data.mastery_score': {kind:'number', readOnly:true},
    'cmi.student_data.max_time_allowed': {kind:'timeinterval12', readOnly:true},
    'cmi.student_data.time_limit_action': {kind:'string', readOnly:true},
    'cmi.student_preference._children': {kind:'string', readOnly:true},
    'cmi.student_preference.audio': {kind:'number'},
    'cmi.student_preference.language': {kind:'string', maxLength:255},
    'cmi.student_preference.speed': {kind:'number'},
    'cmi.student_preference.text': {kind:'integer'},
    'cmi.interactions._children': {kind:'string', readOnly:true},
    'cmi.interactions._count': {kind:'integer', readOnly:true},
    'cmi.objectives._children': {kind:'string', readOnly:true},
    'cmi.objectives._count': {kind:'integer', readOnly:true},
  };

  const RULES_2004 = {
    'cmi._version': {kind:'string', readOnly:true},
    'cmi.comments_from_learner._children': {kind:'string', readOnly:true},
    'cmi.comments_from_learner._count': {kind:'integer', readOnly:true},
    'cmi.comments_from_lms._children': {kind:'string', readOnly:true},
    'cmi.comments_from_lms._count': {kind:'integer', readOnly:true},
    'cmi.completion_status': {kind:'completion2004', allowed:COMPLETION_2004},
    'cmi.completion_threshold': {kind:'progress', readOnly:true},
    'cmi.credit': {kind:'string', readOnly:true},
    'cmi.entry': {kind:'string', readOnly:true},
    'cmi.exit': {kind:'exit2004', allowed:EXIT_2004},
    'cmi.interactions._children': {kind:'string', readOnly:true},
    'cmi.interactions._count': {kind:'integer', readOnly:true},
    'cmi.launch_data': {kind:'string', readOnly:true},
    'cmi.learner_id': {kind:'string', readOnly:true},
    'cmi.learner_name': {kind:'localizedString', readOnly:true},
    'cmi.learner_preference._children': {kind:'string', readOnly:true},
    'cmi.learner_preference.audio_level': {kind:'number'},
    'cmi.learner_preference.language': {kind:'string', maxLength:250},
    'cmi.learner_preference.delivery_speed': {kind:'number'},
    'cmi.learner_preference.audio_captioning': {kind:'integer'},
    'cmi.location': {kind:'string', maxLength:1000},
    'cmi.max_time_allowed': {kind:'timeinterval2004', readOnly:true},
    'cmi.mode': {kind:'string', readOnly:true},
    'cmi.objectives._children': {kind:'string', readOnly:true},
    'cmi.objectives._count': {kind:'integer', readOnly:true},
    'cmi.progress_measure': {kind:'progress'},
    'cmi.scaled_passing_score': {kind:'scoreScaled', readOnly:true},
    'cmi.score._children': {kind:'string', readOnly:true},
    'cmi.score.raw': {kind:'number'},
    'cmi.score.max': {kind:'number'},
    'cmi.score.min': {kind:'number'},
    'cmi.score.scaled': {kind:'scoreScaled'},
    'cmi.session_time': {kind:'timeinterval2004'},
    'cmi.success_status': {kind:'success2004', allowed:SUCCESS_2004},
    'cmi.suspend_data': {kind:'string', maxLength:64000},
    'cmi.time_limit_action': {kind:'string', readOnly:true},
    'cmi.total_time': {kind:'timeinterval2004', readOnly:true},
    'adl.nav.request': {kind:'navRequest2004'},
  };

  function findRule12(key) {
    const direct = RULES_12[key];
    if (direct) return direct;
    const objective = key.match(/^cmi\.objectives\.(\d+)\.(id|status|score\.(raw|min|max))$/);
    if (objective) {
      if (objective[2] === 'status') return {kind:'status12', allowed:STATUS_12};
      if (objective[2].startsWith('score.')) return {kind:'number'};
      return {kind:'string', maxLength:255};
    }
    if (/^cmi\.interactions\.\d+\.id$/.test(key)) return {kind:'string', maxLength:255};
    if (/^cmi\.interactions\.\d+\.objectives\.\d+\.id$/.test(key)) return {kind:'string', maxLength:255};
    if (/^cmi\.interactions\.\d+\.time$/.test(key)) return {kind:'time12'};
    if (/^cmi\.interactions\.\d+\.type$/.test(key)) return {kind:'interactionType12', allowed:INTERACTION_TYPES_12};
    if (/^cmi\.interactions\.\d+\.correct_responses\.\d+\.pattern$/.test(key)) return {kind:'string', maxLength:4096};
    if (/^cmi\.interactions\.\d+\.weighting$/.test(key)) return {kind:'number'};
    if (/^cmi\.interactions\.\d+\.student_response$/.test(key)) return {kind:'string', maxLength:4096};
    if (/^cmi\.interactions\.\d+\.result$/.test(key)) return {kind:'result12', allowed:RESULT_12};
    if (/^cmi\.interactions\.\d+\.latency$/.test(key)) return {kind:'latency'};
    return null;
  }

  function findRule2004(key) {
    const direct = RULES_2004[key];
    if (direct) return direct;
    if (/^cmi\.objectives\.\d+\.id$/.test(key)) return {kind:'string', maxLength:4000};
    if (/^cmi\.objectives\.\d+\.score\.(scaled|raw|min|max)$/.test(key)) return key.endsWith('.scaled') ? {kind:'scoreScaled'} : {kind:'number'};
    if (/^cmi\.objectives\.\d+\.success_status$/.test(key)) return {kind:'success2004', allowed:SUCCESS_2004};
    if (/^cmi\.objectives\.\d+\.completion_status$/.test(key)) return {kind:'completion2004', allowed:COMPLETION_2004};
    if (/^cmi\.objectives\.\d+\.progress_measure$/.test(key)) return {kind:'progress'};
    if (/^cmi\.objectives\.\d+\.description$/.test(key)) return {kind:'localizedString', maxLength:4000};
    if (/^cmi\.interactions\.\d+\.id$/.test(key)) return {kind:'string', maxLength:4000};
    if (/^cmi\.interactions\.\d+\.type$/.test(key)) return {kind:'interactionType2004', allowed:INTERACTION_TYPES_2004};
    if (/^cmi\.interactions\.\d+\.objectives\.\d+\.id$/.test(key)) return {kind:'string', maxLength:4000};
    if (/^cmi\.interactions\.\d+\.timestamp$/.test(key)) return {kind:'string'};
    if (/^cmi\.interactions\.\d+\.correct_responses\.\d+\.pattern$/.test(key)) return {kind:'string', maxLength:4000};
    if (/^cmi\.interactions\.\d+\.weighting$/.test(key)) return {kind:'number'};
    if (/^cmi\.interactions\.\d+\.learner_response$/.test(key)) return {kind:'string', maxLength:4000};
    if (/^cmi\.interactions\.\d+\.result$/.test(key)) return {kind:'result2004', allowed:RESULT_2004};
    if (/^cmi\.interactions\.\d+\.latency$/.test(key)) return {kind:'latency'};
    if (/^cmi\.interactions\.\d+\.description$/.test(key)) return {kind:'localizedString', maxLength:4000};
    if (/^cmi\.comments_from_learner\.\d+\.(comment|location|timestamp)$/.test(key)) return {kind:'string', maxLength:4000};
    return null;
  }

  function findRule(key) { return is2004 ? findRule2004(key) : findRule12(key); }

  const incoming = options.initialState && typeof options.initialState === 'object' ? options.initialState : {};
  const incomingValues = incoming.values && typeof incoming.values === 'object' ? incoming.values : incoming;
  const learnerId = String(options.learnerId ?? incomingValues['cmi.learner_id'] ?? incomingValues['cmi.core.student_id'] ?? '');
  const learnerName = String(options.learnerName ?? incomingValues['cmi.learner_name'] ?? incomingValues['cmi.core.student_name'] ?? '');
  const launchData = String(options.launchData ?? incomingValues['cmi.launch_data'] ?? '');
  const masteryScore = options.masteryScore ?? incomingValues['cmi.student_data.mastery_score'] ?? '';

  const defaults = is2004 ? {
    'cmi._version': '1.0',
    'cmi.learner_id': learnerId,
    'cmi.learner_name': learnerName,
    'cmi.completion_status': 'not attempted',
    'cmi.success_status': 'unknown',
    'cmi.entry': 'ab-initio',
    'cmi.mode': 'normal',
    'cmi.credit': 'credit',
    'cmi.location': '',
    'cmi.suspend_data': '',
    'cmi.launch_data': launchData,
    'cmi.score._children': 'scaled,raw,min,max',
    'cmi.objectives._children': 'id,score,success_status,completion_status,progress_measure,description',
    'cmi.objectives._count': '0',
    'cmi.interactions._children': 'id,type,objectives,timestamp,correct_responses,weighting,learner_response,result,latency,description',
    'cmi.interactions._count': '0',
    'cmi.comments_from_learner._children': 'comment,location,timestamp',
    'cmi.comments_from_learner._count': '0',
    'cmi.comments_from_lms._children': 'comment,location,timestamp',
    'cmi.comments_from_lms._count': '0',
    'adl.nav.request': '_none',
  } : {
    'cmi.core._children': 'student_id,student_name,lesson_location,credit,lesson_status,entry,score,total_time,lesson_mode,exit,session_time',
    'cmi.core.student_id': learnerId,
    'cmi.core.student_name': learnerName,
    'cmi.core.lesson_status': 'not attempted',
    'cmi.core.entry': 'ab-initio',
    'cmi.core.lesson_mode': 'normal',
    'cmi.core.credit': 'credit',
    'cmi.core.lesson_location': '',
    'cmi.core.score._children': 'raw,min,max',
    'cmi.core.total_time': '0000:00:00.00',
    'cmi.suspend_data': '',
    'cmi.launch_data': launchData,
    'cmi.student_data._children': 'mastery_score,max_time_allowed,time_limit_action',
    'cmi.student_data.mastery_score': masteryScore == null ? '' : String(masteryScore),
    'cmi.interactions._children': 'id,objectives,time,type,correct_responses,weighting,student_response,result,latency',
    'cmi.interactions._count': '0',
    'cmi.objectives._children': 'id,score,status',
    'cmi.objectives._count': '0',
  };

  const values = {...defaults};
  for (const [key, value] of Object.entries(incomingValues)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') values[String(key)] = String(value);
  }
  if (is2004) {
    if (values['cmi.exit'] === 'suspend') values['cmi.entry'] = 'resume';
    values['cmi.exit'] = '';
    values['cmi.session_time'] = '';
  } else {
    if (values['cmi.core.exit'] === 'suspend') values['cmi.core.entry'] = 'resume';
    values['cmi.core.exit'] = '';
    values['cmi.core.session_time'] = '';
  }

  let lifecycle = 'not-initialized';
  let lastError = '0';
  const notify = typeof options.onChange === 'function' ? options.onChange : () => {};
  const navigationRequest = typeof options.onNavigationRequest === 'function' ? options.onNavigationRequest : () => {};
  const requestValidResolver = typeof options.requestValid === 'function'
    ? options.requestValid
    : (key) => options.requestValid && typeof options.requestValid === 'object' ? options.requestValid[key] : undefined;

  const errors12 = {
    '0':'No error','101':'General exception','201':'Invalid argument error','301':'Not initialized','401':'Not implemented error',
    '402':'Invalid set value, element is a keyword','403':'Element is read only','404':'Element is write only','405':'Incorrect data type',
  };
  const errors2004 = {
    '0':'No error','101':'General exception','102':'General initialization failure','103':'Already initialized','104':'Content instance terminated',
    '111':'General termination failure','112':'Termination before initialization','113':'Termination after termination','122':'Retrieve data before initialization',
    '123':'Retrieve data after termination','132':'Store data before initialization','133':'Store data after termination','142':'Commit before initialization',
    '143':'Commit after termination','201':'General argument error','301':'General get failure','351':'General set failure','391':'General commit failure',
    '401':'Undefined data model element','404':'Data model element is read only','405':'Data model element is write only','406':'Data model element type mismatch',
    '407':'Data model element value out of range',
  };
  const errorStrings = is2004 ? errors2004 : errors12;

  function setError(code) { lastError = String(code); return false; }
  function ok() { lastError = '0'; return true; }
  function bool(value) { return value ? 'true' : 'false'; }
  function validKey(key) {
    return typeof key === 'string' && (key.startsWith('cmi.') || (is2004 && key.startsWith('adl.nav.'))) && !key.includes('..') && !/\s/.test(key);
  }
  function dynamicCount(prefix) {
    const escaped = prefix.replace(/\./g, '\\.');
    const indices = new Set();
    const pattern = new RegExp(`^${escaped}\\.(\\d+)\\.`);
    for (const key of Object.keys(values)) {
      const match = key.match(pattern);
      if (match) indices.add(match[1]);
    }
    return String(indices.size);
  }
  function countValue(key) {
    const prefixes = is2004
      ? ['cmi.objectives','cmi.interactions','cmi.comments_from_learner','cmi.comments_from_lms']
      : ['cmi.objectives','cmi.interactions'];
    for (const prefix of prefixes) if (key === `${prefix}._count`) return dynamicCount(prefix);
    return null;
  }
  function knownKey(key) {
    if (Object.prototype.hasOwnProperty.call(values, key)) return true;
    if (findRule(key)) return true;
    if (is2004 && /^cmi\.comments_from_lms\.\d+\.(comment|location|timestamp)$/.test(key)) return true;
    if (is2004 && /^adl\.nav\.request_valid\./.test(key)) return true;
    return false;
  }
  function readOnly(key) {
    const rule = findRule(key);
    if (rule?.readOnly) return true;
    if (is2004 && /^adl\.nav\.request_valid\./.test(key)) return true;
    return is2004 && /^cmi\.comments_from_lms\.\d+\.(comment|location|timestamp)$/.test(key);
  }
  function validateValue(key, raw) {
    const rule = findRule(key);
    if (!rule) return {ok:true};
    const value = String(raw ?? '');
    if (rule.allowed && !rule.allowed.includes(value)) return {ok:false, range:false};
    if (rule.maxLength && value.length > rule.maxLength) return {ok:false, range:true};
    if (rule.kind === 'navRequest2004') {
      if (['continue','previous','exit','exitAll','abandon','abandonAll','suspendAll','_none'].includes(value)) return {ok:true};
      if (/^(?:choice|jump)\{target=.+\}$/.test(value)) return {ok:true};
      return {ok:false, range:false};
    }
    if (['number','integer','scoreScaled','progress'].includes(rule.kind)) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return {ok:false, range:false};
      if (rule.kind === 'integer' && !Number.isInteger(numeric)) return {ok:false, range:false};
      if (rule.kind === 'scoreScaled' && (numeric < -1 || numeric > 1)) return {ok:false, range:true};
      if (rule.kind === 'progress' && (numeric < 0 || numeric > 1)) return {ok:false, range:true};
    }
    if ((rule.kind === 'timeinterval12' || rule.kind === 'latency') && !/^\d{2,4}:\d{2}:\d{2}(\.\d{1,2})?$/.test(value)) return {ok:false, range:false};
    if (rule.kind === 'time12' && !/^\d{2}:\d{2}:\d{2}(\.\d{1,2})?$/.test(value)) return {ok:false, range:false};
    if (rule.kind === 'timeinterval2004' && !/^P(?:\d+Y)?(?:\d+M)?(?:\d+D)?(?:T(?:\d+H)?(?:\d+M)?(?:\d+(?:\.\d+)?S)?)?$/.test(value)) return {ok:false, range:false};
    return {ok:true};
  }
  function snapshot(reason = 'state') {
    const out = {...values};
    const countKeys = is2004
      ? ['cmi.objectives._count','cmi.interactions._count','cmi.comments_from_learner._count','cmi.comments_from_lms._count']
      : ['cmi.objectives._count','cmi.interactions._count'];
    for (const key of countKeys) out[key] = countValue(key);
    return {schema:'https://p2lrn.org/schema/scorm-runtime-state/1', version:'1', scormVersion:version, reason, values:out, lifecycle};
  }
  function changed(reason, key = null) { try { notify(snapshot(reason), {reason,key}); } catch {} }
  function requireInitialized(kind) {
    if (lifecycle === 'initialized') return true;
    if (is2004) return setError(lifecycle === 'terminated' ? (kind === 'get' ? '123' : kind === 'set' ? '133' : '143') : (kind === 'get' ? '122' : kind === 'set' ? '132' : '142'));
    return setError('301');
  }
  function initialize(argument) {
    if (String(argument ?? '') !== '') return bool(setError('201'));
    if (lifecycle === 'initialized') return bool(setError(is2004 ? '103' : '101'));
    if (lifecycle === 'terminated') return bool(setError(is2004 ? '104' : '101'));
    lifecycle = 'initialized'; ok(); changed('initialize'); return 'true';
  }
  function terminate(argument) {
    if (String(argument ?? '') !== '') return bool(setError('201'));
    if (lifecycle !== 'initialized') return bool(setError(is2004 ? (lifecycle === 'terminated' ? '113' : '112') : '301'));
    lifecycle = 'terminated';
    ok();
    const state = snapshot('terminate');
    changed('terminate');
    if (is2004) {
      const request = String(values['adl.nav.request'] ?? '_none');
      try { navigationRequest(request, state); } catch {}
    }
    return 'true';
  }
  function getValue(rawKey) {
    if (!requireInitialized('get')) return '';
    const key = String(rawKey ?? '');
    if (!validKey(key)) { setError('201'); return ''; }
    const count = countValue(key);
    if (count !== null) { ok(); return count; }
    if (!knownKey(key)) { setError('401'); return ''; }
    if (is2004 && /^adl\.nav\.request_valid\./.test(key)) {
      const resolved = String(requestValidResolver(key) ?? 'unknown');
      ok();
      return ['true','false','unknown'].includes(resolved) ? resolved : 'unknown';
    }
    ok(); return values[key] ?? '';
  }
  function setValue(rawKey, rawValue) {
    if (!requireInitialized('set')) return 'false';
    const key = String(rawKey ?? '');
    if (!validKey(key)) return bool(setError('201'));
    if (!knownKey(key)) return bool(setError('401'));
    if (readOnly(key)) return bool(setError(is2004 ? '404' : '403'));
    const value = String(rawValue ?? '');
    const validation = validateValue(key, value);
    if (!validation.ok) return bool(setError(is2004 && validation.range ? '407' : (is2004 ? '406' : '405')));
    values[key] = value; ok(); changed('set', key); return 'true';
  }
  function commit(argument) {
    if (String(argument ?? '') !== '') return bool(setError('201'));
    if (!requireInitialized('commit')) return 'false';
    ok(); changed('commit'); return 'true';
  }
  function getLastError() { return lastError; }
  function getErrorString(code) { return errorStrings[String(code ?? '')] ?? 'Unknown error'; }
  function getDiagnostic(code) { const key = String(code ?? lastError); return errorStrings[key] ?? `SCORM error ${key}`; }

  const api12 = Object.freeze({
    LMSInitialize:initialize,LMSFinish:terminate,LMSGetValue:getValue,LMSSetValue:setValue,LMSCommit:commit,
    LMSGetLastError:getLastError,LMSGetErrorString:getErrorString,LMSGetDiagnostic:getDiagnostic,
  });
  const api2004 = Object.freeze({
    Initialize:initialize,Terminate:terminate,GetValue:getValue,SetValue:setValue,Commit:commit,
    GetLastError:getLastError,GetErrorString:getErrorString,GetDiagnostic:getDiagnostic,
  });
  return Object.freeze({version, api:is2004 ? api2004 : api12, snapshot, get lifecycle() { return lifecycle; }});
}
