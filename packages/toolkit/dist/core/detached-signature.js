import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign as cryptoSign, verify as cryptoVerify } from 'node:crypto';
import { ValidationError } from './errors.js';
import { canonicalizeBytes } from './jcs.js';
import { parseIJson } from './ijson.js';
import { validateSchema } from './json-schema.js';
import { validatePackageFile } from './validator.js';
import { NS, LEGACY_NS, canonicalIdentifier } from './constants.js';
export const SIGNATURE_SCHEMA_ID = `${NS}schema/detached-signature/1`;
export const LEGACY_SIGNATURE_SCHEMA_ID = `${LEGACY_NS}schema/detached-signature/1`;
export const SIGNATURE_INPUT_SCHEMA_ID = `${NS}schema/detached-signature-input/1`;
export const LEGACY_SIGNATURE_INPUT_SCHEMA_ID = `${LEGACY_NS}schema/detached-signature-input/1`;
export const KEY_ID_PREFIX = 'urn:p2lrn:key:ed25519:sha256:';
export const LEGACY_KEY_ID_PREFIX = 'urn:p2rln:key:ed25519:sha256:';
export class DetachedSignatureError extends ValidationError {
}
function b64u(data) { return Buffer.from(data).toString('base64url'); }
function unb64u(v) { if (typeof v !== 'string' || !/^[A-Za-z0-9_-]+$/.test(v))
    throw new DetachedSignatureError('invalid base64url value'); try {
    return new Uint8Array(Buffer.from(v, 'base64url'));
}
catch {
    throw new DetachedSignatureError('invalid base64url value');
} }
function rawPublic(key) { const jwk = key.export({ format: 'jwk' }); if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || typeof jwk.x !== 'string')
    throw new DetachedSignatureError('public key is not Ed25519'); return unb64u(jwk.x); }
function fingerprint(key) { return createHash('sha256').update(rawPublic(key)).digest('hex'); }
export function keyIdForPublicKey(key) { return KEY_ID_PREFIX + fingerprint(key); }
function legacyKeyIdForPublicKey(key) { return LEGACY_KEY_ID_PREFIX + fingerprint(key); }
function loadPrivate(path) { try {
    const k = createPrivateKey(readFileSync(path));
    const jwk = k.export({ format: 'jwk' });
    if (jwk.crv !== 'Ed25519')
        throw new Error('not Ed25519');
    return k;
}
catch (e) {
    throw new DetachedSignatureError(`cannot load private key ${path}: ${e instanceof Error ? e.message : String(e)}`);
} }
function loadPublic(path) { try {
    const k = createPublicKey(readFileSync(path));
    const jwk = k.export({ format: 'jwk' });
    if (jwk.crv !== 'Ed25519')
        throw new Error('not Ed25519');
    return k;
}
catch (e) {
    throw new DetachedSignatureError(`cannot load public key ${path}: ${e instanceof Error ? e.message : String(e)}`);
} }
export function generateKeypair(privatePath, publicPath, force = false) { if (!force)
    for (const p of [privatePath, publicPath])
        if (existsSync(p))
            throw new DetachedSignatureError(`refusing to overwrite existing key: ${p}`); mkdirSync(dirname(privatePath), { recursive: true }); mkdirSync(dirname(publicPath), { recursive: true }); const { privateKey, publicKey } = generateKeyPairSync('ed25519'); writeFileSync(privatePath, privateKey.export({ format: 'pem', type: 'pkcs8' })); try {
    chmodSync(privatePath, 0o600);
}
catch { } writeFileSync(publicPath, publicKey.export({ format: 'pem', type: 'spki' })); return { algorithm: 'Ed25519', keyId: keyIdForPublicKey(publicKey), privateKey: privatePath, publicKey: publicPath }; }
function manifest(path) { try {
    return validatePackageFile(path).manifest;
}
catch (e) {
    throw new DetachedSignatureError(`cannot sign/verify invalid P2LRN package: ${e instanceof Error ? e.message : String(e)}`);
} }
export function targetForManifest(m, scope) { if (!['content', 'package'].includes(scope))
    throw new DetachedSignatureError("signature scope must be 'content' or 'package'"); return { scope, format: m.format, formatVersion: m.formatVersion, contentRoot: m.integrity.contentRoot, ...(scope === 'package' ? { packageId: m.packageId } : {}) }; }
function inputSchemaForEnvelope(e) { return canonicalIdentifier(String(e?.schema ?? '')) === SIGNATURE_SCHEMA_ID && String(e?.schema ?? '').includes('p2rln.org') ? LEGACY_SIGNATURE_INPUT_SCHEMA_ID : SIGNATURE_INPUT_SCHEMA_ID; }
export function signatureStatement(e) { return { schema: inputSchemaForEnvelope(e), version: '1', algorithm: e.algorithm, keyId: e.keyId, target: e.target }; }
function validateEnvelope(e) { const raw = String(e?.schema ?? ''); const schema = canonicalIdentifier(raw) === SIGNATURE_SCHEMA_ID ? raw : SIGNATURE_SCHEMA_ID; try {
    validateSchema(schema, e, 'detached signature');
}
catch (err) {
    throw new DetachedSignatureError(err instanceof Error ? err.message : String(err));
} return e; }
export function signPackage(packagePath, privateKeyPath, output, scope = 'content', force = false) { const m = manifest(packagePath), priv = loadPrivate(privateKeyPath), pub = createPublicKey(priv), raw = rawPublic(pub), legacy = m.format === 'P2RLN', keyId = legacy ? legacyKeyIdForPublicKey(pub) : keyIdForPublicKey(pub), e = { schema: legacy ? LEGACY_SIGNATURE_SCHEMA_ID : SIGNATURE_SCHEMA_ID, version: '1', algorithm: 'Ed25519', keyId, publicKey: { format: 'raw', encoding: 'base64url', value: b64u(raw) }, target: targetForManifest(m, scope) }; e.signature = b64u(cryptoSign(null, canonicalizeBytes(signatureStatement(e)), priv)); validateEnvelope(e); const out = output ?? `${packagePath}.sig`; if (existsSync(out) && !force)
    throw new DetachedSignatureError(`refusing to overwrite existing signature: ${out}`); mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(e, null, 2) + '\n'); return { signature: out, keyId, scope, contentRoot: e.target.contentRoot, packageId: e.target.packageId, bytes: statSync(out).size }; }
export function loadSignature(path) { let e; try {
    e = parseIJson(readFileSync(path), 'detached signature');
}
catch (err) {
    throw new DetachedSignatureError(`cannot read detached signature ${path}: ${err instanceof Error ? err.message : String(err)}`);
} return validateEnvelope(e); }
export function verifyPackageSignature(packagePath, signaturePath, options = {}) { const m = manifest(packagePath), e = loadSignature(signaturePath), raw = unb64u(e.publicKey.value); if (raw.byteLength !== 32)
    throw new DetachedSignatureError('embedded Ed25519 public key must be exactly 32 bytes'); let pub; try {
    pub = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: b64u(raw) }, format: 'jwk' });
}
catch {
    throw new DetachedSignatureError('invalid embedded Ed25519 public key');
} const keyId = keyIdForPublicKey(pub), legacyKeyId = legacyKeyIdForPublicKey(pub); if (e.keyId !== keyId && e.keyId !== legacyKeyId)
    throw new DetachedSignatureError('keyId does not match the embedded public key fingerprint'); if (JSON.stringify(targetForManifest(m, e.target.scope)) !== JSON.stringify(e.target))
    throw new DetachedSignatureError('detached signature target does not match this P2LRN package'); if (!cryptoVerify(null, canonicalizeBytes(signatureStatement(e)), pub, unb64u(e.signature)))
    throw new DetachedSignatureError('Ed25519 signature verification failed'); let trusted = false; const sources = []; for (const p of options.trustedPublicKeys ?? []) {
    const k = loadPublic(p);
    if (fingerprint(k) === fingerprint(pub) && Buffer.from(rawPublic(k)).equals(Buffer.from(raw))) {
        trusted = true;
        sources.push(p);
    }
} if (options.requireTrusted && !trusted)
    throw new DetachedSignatureError(`signature is cryptographically valid but key ${e.keyId} is not in the supplied trust store`); return { valid: true, cryptographicallyValid: true, trusted, keyId: e.keyId, trustSources: sources, scope: e.target.scope, contentRoot: e.target.contentRoot, packageId: e.target.packageId }; }
//# sourceMappingURL=detached-signature.js.map