// P2LRN LTI 1.3 platform-neutral authentication and Deep Linking core.
// This is server-only. The caller supplies a trusted platform registry and a
// durable, atomically consumed OIDC transaction store; it is not an HTTP server.
import {
  createHash, createPrivateKey, createPublicKey, randomBytes, sign, timingSafeEqual, verify
} from 'node:crypto';
import {
  LTI_CLAIMS, createP2LRNDeepLinkItem, projectVerifiedLtiResourceLaunch
} from './launch-contract.mjs';

const DL_SETTINGS = 'https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings';
const DL_ITEMS = 'https://purl.imsglobal.org/spec/lti-dl/claim/content_items';
const DL_DATA = 'https://purl.imsglobal.org/spec/lti-dl/claim/data';
const MAX_TOKEN_LENGTH = 65536;
const MAX_LOGIN_HINT_LENGTH = 4096;
const STATE_LIFETIME = 300;
const bytes = size => randomBytes(size).toString('base64url');
const digest = value => createHash('sha256').update(value).digest('hex');
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

function required(value, label, max = 2048) {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new TypeError(label + ' must be a non-empty string of at most ' + max + ' characters');
  return value;
}
function url(value, label) {
  const parsed = new URL(required(value, label));
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password || parsed.hash)
    throw new TypeError(label + ' must be HTTPS without credentials or fragment');
  return parsed;
}
function constantEqualHex(a, b) {
  return typeof a === 'string' && typeof b === 'string' &&
    /^[a-f0-9]{64}$/.test(a) && /^[a-f0-9]{64}$/.test(b) &&
    timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
function parseJwt(token) {
  required(token, 'id_token', MAX_TOKEN_LENGTH);
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some(part => !/^[a-zA-Z0-9_-]+$/.test(part)))
    throw new Error('Invalid JWT encoding');
  let header, claims;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid JWT JSON');
  }
  if (!header || Array.isArray(header) || !claims || Array.isArray(claims) ||
      typeof header !== 'object' || typeof claims !== 'object')
    throw new Error('JWT header and payload must be objects');
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid ||
      header.crit !== undefined || header.jku !== undefined || header.x5u !== undefined)
    throw new Error('Unsupported or unsafe JWT header');
  return {header, claims, input: parts[0] + '.' + parts[1],
    signature: Buffer.from(parts[2], 'base64url')};
}
function verifyPlatformJwt(token, registration, nonceHash, now) {
  const decoded = parseJwt(token);
  const keys = registration.jwks?.keys;
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > 50)
    throw new Error('Trusted LMS JWKS missing');
  const matching = keys.filter(key => key?.kid === decoded.header.kid);
  if (matching.length !== 1) throw new Error('Unknown or ambiguous LMS signing key');
  const jwk = matching[0];
  if (jwk.kty !== 'RSA' || typeof jwk.n !== 'string' || typeof jwk.e !== 'string' ||
      (jwk.use && jwk.use !== 'sig') || (jwk.alg && jwk.alg !== 'RS256') ||
      (jwk.key_ops && (!Array.isArray(jwk.key_ops) || !jwk.key_ops.includes('verify'))))
    throw new Error('LMS signing key is not a permitted RSA verification key');
  let publicKey;
  try { publicKey = createPublicKey({key: jwk, format: 'jwk'}); }
  catch { throw new Error('Invalid trusted LMS public key'); }
  if (publicKey.asymmetricKeyType !== 'rsa' ||
      (publicKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048)
    throw new Error('LMS RSA key is too weak');
  if (!verify('RSA-SHA256', Buffer.from(decoded.input), publicKey, decoded.signature))
    throw new Error('Invalid LMS JWT signature');
  const claims = decoded.claims;
  if (claims.iss !== registration.issuer) throw new Error('LMS issuer mismatch');
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(registration.clientId) ||
      (audiences.length > 1 || claims.azp !== undefined) && claims.azp !== registration.clientId)
    throw new Error('LMS audience/authorized party mismatch');
  if (!Number.isInteger(claims.iat) || !Number.isInteger(claims.exp) ||
      claims.iat > now + 60 || claims.iat < now - 600 ||
      claims.exp <= now - 60 || claims.exp > claims.iat + 900 ||
      (claims.nbf !== undefined && (!Number.isInteger(claims.nbf) || claims.nbf > now + 60)))
    throw new Error('Expired, future or invalid LMS JWT timestamps');
  if (typeof claims.nonce !== 'string' ||
      !constantEqualHex(digest(claims.nonce), nonceHash))
    throw new Error('LMS OIDC nonce mismatch');
  return claims;
}
function assertRegistration(registration, issuer, clientId) {
  const reg = object(registration);
  if (reg.status !== 'ACTIVE' || reg.issuer !== issuer || reg.clientId !== clientId)
    throw new Error('Unknown or inactive LTI platform registration');
  required(reg.id, 'registration.id');
  required(reg.tenantId, 'registration.tenantId');
  url(reg.issuer, 'registration.issuer');
  url(reg.authUrl, 'registration.authUrl');
  url(reg.launchUrl, 'registration.launchUrl');
  if (reg.deepLinkLaunchUrl !== undefined) url(reg.deepLinkLaunchUrl, 'registration.deepLinkLaunchUrl');
  if (!Array.isArray(reg.deployments) || !reg.deployments.length ||
      reg.deployments.some(dep => typeof dep !== 'string' || !dep.trim()))
    throw new Error('Active LTI deployments required');
  return reg;
}
function isInstructor(roles) {
  return Array.isArray(roles) && roles.some(role =>
    typeof role === 'string' && /#(Instructor|Administrator|ContentDeveloper)$/i.test(role));
}
function rsaToolKey(tool) {
  const privateKey = createPrivateKey(required(tool?.privateKeyPem, 'tool.privateKeyPem', 20000));
  const kid = required(tool?.kid, 'tool.kid', 256);
  if (privateKey.asymmetricKeyType !== 'rsa' ||
      (privateKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048)
    throw new Error('P2LRN must sign with a 2048-bit or stronger RSA key');
  return {privateKey, kid};
}
function signToolJwt(privateKey, kid, payload) {
  const header = {alg: 'RS256', typ: 'JWT', kid};
  const encoded = x => Buffer.from(JSON.stringify(x)).toString('base64url');
  const input = encoded(header) + '.' + encoded(payload);
  return input + '.' + sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url');
}

// Transaction store:
// create({stateHash,nonceHash,browserHash,issuer,clientId,registrationId,
//         deploymentHint,targetLinkUri,expiresAt})
// consume(stateHash) -> record or null; MUST be atomic and single-use, and enforce TTL.
// getRegistration({issuer,clientId}) -> explicitly approved ACTIVE platform with
// {id,tenantId,issuer,clientId,authUrl,launchUrl,deepLinkLaunchUrl?,
//  deployments,jwks:{keys:[...]},deepLinkReturnOrigins:[...] }.
// getBinding({id,tenantId,registrationId,deploymentId}) -> published P2LRN binding.
export function createP2LRNLtiProvider({getRegistration, transactions, getBinding, tool, now = () => Math.floor(Date.now() / 1000)}) {
  if (typeof getRegistration !== 'function' || typeof getBinding !== 'function' ||
      typeof transactions?.create !== 'function' || typeof transactions?.consume !== 'function')
    throw new TypeError('Trusted registration, binding and atomic transaction adapters are required');
  if (typeof now !== 'function') throw new TypeError('now must be a function');
  const {privateKey, kid} = rsaToolKey(tool);
  const launched = new WeakMap();

  async function beginLogin({login, browserBinding}) {
    const request = object(login);
    const issuer = required(request.iss, 'iss');
    const clientId = required(request.client_id, 'client_id', 512);
    const hint = required(request.login_hint, 'login_hint', MAX_LOGIN_HINT_LENGTH);
    const target = url(request.target_link_uri, 'target_link_uri').toString();
    const binding = required(browserBinding, 'browserBinding', 512);
    const reg = assertRegistration(await getRegistration({issuer, clientId}), issuer, clientId);
    const targets = [reg.launchUrl, reg.deepLinkLaunchUrl].filter(Boolean);
    if (!targets.includes(target)) throw new Error('Unregistered LTI target_link_uri');
    const deploymentHint = request.lti_deployment_id == null
      ? null : required(request.lti_deployment_id, 'lti_deployment_id');
    if (deploymentHint && !reg.deployments.includes(deploymentHint))
      throw new Error('Unknown LTI deployment');
    const state = bytes(32), nonce = bytes(32), expiresAt = now() + STATE_LIFETIME;
    await transactions.create({
      stateHash: digest(state), nonceHash: digest(nonce), browserHash: digest(binding),
      issuer, clientId, registrationId: reg.id, deploymentHint, targetLinkUri: target,
      expiresAt
    });
    const auth = url(reg.authUrl, 'authUrl');
    const params = auth.searchParams;
    params.set('response_type', 'id_token');
    params.set('response_mode', 'form_post');
    params.set('scope', 'openid');
    params.set('prompt', 'none');
    params.set('client_id', clientId);
    params.set('redirect_uri', target);
    params.set('login_hint', hint);
    params.set('state', state);
    params.set('nonce', nonce);
    if (request.lti_message_hint != null)
      params.set('lti_message_hint', required(request.lti_message_hint, 'lti_message_hint', MAX_LOGIN_HINT_LENGTH));
    return {authorizationUrl: auth.toString(), expiresAt};
  }

  async function verifyLaunch({state, idToken, browserBinding}) {
    const hash = digest(required(state, 'state', 512));
    // The persistent store MUST consume before token verification, even on failure.
    const transaction = await transactions.consume(hash);
    if (!transaction || transaction.expiresAt <= now())
      throw new Error('Missing, consumed or expired LTI OIDC state');
    if (!constantEqualHex(transaction.browserHash,
      digest(required(browserBinding, 'browserBinding', 512))))
      throw new Error('LTI browser binding mismatch');
    const reg = assertRegistration(await getRegistration({
      issuer: transaction.issuer, clientId: transaction.clientId
    }), transaction.issuer, transaction.clientId);
    if (reg.id !== transaction.registrationId) throw new Error('LTI registration changed');
    const claims = verifyPlatformJwt(idToken, reg, transaction.nonceHash, now());
    const deployment = claims[LTI_CLAIMS.deploymentId];
    if (typeof deployment !== 'string' || !reg.deployments.includes(deployment) ||
        transaction.deploymentHint && transaction.deploymentHint !== deployment)
      throw new Error('Unregistered LTI deployment');
    if (claims[LTI_CLAIMS.version] !== '1.3.0' ||
        claims[LTI_CLAIMS.targetLinkUri] !== transaction.targetLinkUri)
      throw new Error('LTI protocol or target mismatch');
    const kind = claims[LTI_CLAIMS.messageType];
    if (kind === 'LtiResourceLinkRequest') {
      if (transaction.targetLinkUri !== reg.launchUrl)
        throw new Error('Resource link requested at the wrong LTI endpoint');
      const id = object(claims[LTI_CLAIMS.custom]).p2lrn_binding_id;
      const binding = await getBinding({
        id: required(id, 'p2lrn_binding_id', 128),
        tenantId: reg.tenantId, registrationId: reg.id, deploymentId: deployment
      });
      const launch = projectVerifiedLtiResourceLaunch({
        verified: {verifier: 'server-verified-lti-1.3', claims},
        registration: {...reg, deploymentId: deployment},
        binding
      });
      const result = Object.freeze({kind: 'resource', launch});
      launched.set(result, {registration: reg, deployment, claims});
      return result;
    }
    if (kind === 'LtiDeepLinkingRequest') {
      if (transaction.targetLinkUri !== (reg.deepLinkLaunchUrl || reg.launchUrl))
        throw new Error('Deep Linking requested at the wrong LTI endpoint');
      if (!isInstructor(claims[LTI_CLAIMS.roles]))
        throw new Error('Deep Linking requires an authorized instructor');
      const settings = object(claims[DL_SETTINGS]);
      if (!Array.isArray(settings.accept_types) ||
          !settings.accept_types.includes('ltiResourceLink'))
        throw new Error('The LMS does not accept LTI resource links');
      const returnUrl = url(settings.deep_link_return_url, 'deep_link_return_url').toString();
      const origins = reg.deepLinkReturnOrigins;
      if (!Array.isArray(origins) || !origins.includes(new URL(returnUrl).origin))
        throw new Error('Unapproved LMS Deep Linking return origin');
      const result = Object.freeze({kind: 'deep-link', tenantId: reg.tenantId,
        registrationId: reg.id, deploymentId: deployment, returnUrl});
      launched.set(result, {registration: reg, deployment, claims, settings});
      return result;
    }
    throw new Error('Unsupported LTI message type');
  }

  async function deepLinkResponse({launch, selected}) {
    const context = launched.get(launch);
    if (!context || launch.kind !== 'deep-link')
      throw new Error('Only a verified Deep Linking launch may sign a response');
    if (!Array.isArray(selected) || selected.length > 50)
      throw new TypeError('Deep Linking selection must be a list with at most 50 items');
    const {registration: reg, deployment, claims, settings} = context;
    const items = [];
    for (const entry of selected) {
      const id = required(entry?.bindingId, 'bindingId', 128);
      const binding = await getBinding({
        id, tenantId: reg.tenantId, registrationId: reg.id, deploymentId: deployment
      });
      if (!binding || binding.tenantId !== reg.tenantId ||
          binding.registrationId !== reg.id || binding.deploymentId !== deployment)
        throw new Error('Deep Linking selection is not authorized for this LMS');
      items.push(createP2LRNDeepLinkItem({
        binding, title: required(entry.title, 'title', 200), launchUrl: reg.launchUrl
      }));
    }
    const time = now();
    const payload = {
      iss: reg.clientId, aud: reg.issuer, iat: time, exp: time + 300, nonce: bytes(24),
      [LTI_CLAIMS.version]: '1.3.0',
      [LTI_CLAIMS.messageType]: 'LtiDeepLinkingResponse',
      [LTI_CLAIMS.deploymentId]: deployment,
      [DL_ITEMS]: items
    };
    if (typeof settings.data === 'string' && settings.data.length <= 2048)
      payload[DL_DATA] = settings.data;
    return {returnUrl: launch.returnUrl, jwt: signToolJwt(privateKey, kid, payload)};
  }

  function publicJwks() {
    const jwk = createPublicKey(privateKey).export({format: 'jwk'});
    return {keys: [{...jwk, kid, use: 'sig', alg: 'RS256'}]};
  }
  return Object.freeze({beginLogin, verifyLaunch, deepLinkResponse, publicJwks});
}
