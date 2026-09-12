// @ts-nocheck
import { createServer } from 'node:http';
import { createReadStream, readFileSync, statSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { b64uDecode, ReaderSystemError } from './system.js';
const WEB_ROOT = new URL('../../web/', import.meta.url), MAX_VIRTUAL_DEFLATED = 64 * 1024 * 1024;
function token() { return randomBytes(24).toString('base64url'); }
function range(value, size) { if (!value?.startsWith('bytes=') || value.includes(','))
    return null; const s = value.slice(6).trim(), i = s.indexOf('-'); if (i < 0)
    return null; const a = s.slice(0, i), b = s.slice(i + 1); if (a) {
    const st = Number(a), en = b ? Number(b) : size - 1;
    if (!Number.isInteger(st) || !Number.isInteger(en) || st < 0 || st >= size || en < st)
        return null;
    return [st, Math.min(en, size - 1)];
} const suffix = Number(b); if (!Number.isInteger(suffix) || suffix <= 0)
    return null; return [Math.max(0, size - suffix), size - 1]; }
export class ReaderServer {
    system;
    host;
    verbose;
    token = token();
    server;
    port;
    constructor(system, host = '127.0.0.1', port = 0, verbose = false) {
        this.system = system;
        this.host = host;
        this.verbose = verbose;
        this.port = port;
    }
    get url() { return `http://${this.host}:${this.port}/?t=${encodeURIComponent(this.token)}`; }
    headers(res, type, extra = {}) { res.setHeader('Content-Type', type); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('Cross-Origin-Resource-Policy', 'same-origin'); res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'self'; script-src 'self'; frame-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'"); for (const [k, v] of Object.entries(extra))
        res.setHeader(k, v); }
    json(res, status, obj) { const b = Buffer.from(JSON.stringify(obj, null, 2)); res.statusCode = status; this.headers(res, 'application/json; charset=utf-8', { 'Content-Length': b.length }); res.end(b); }
    bytes(res, status, data, type, opts = {}) { res.statusCode = status; const extra = { 'Content-Length': data.byteLength }; if (opts.cookie)
        extra['Set-Cookie'] = `p2lrn_reader=${this.token}; Path=/; HttpOnly; SameSite=Strict`; this.headers(res, type, extra); if (opts.sandbox)
        res.setHeader('Content-Security-Policy', "default-src 'self' data: blob:; script-src 'none'; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'none'"); res.end(Buffer.from(data)); }
    auth(req, u) { if (u.searchParams.get('t') === this.token)
        return true; return String(req.headers.cookie ?? '').split(';').some((x) => { const v = x.trim(); return v === `p2lrn_reader=${this.token}` || v === `p2rln_reader=${this.token}`; }); }
    hostOk(req) { const h = String(req.headers.host ?? '').replace(/^\[/, '').replace(/\].*$/, '').split(':')[0].toLowerCase(); return ['127.0.0.1', 'localhost', '::1'].includes(h); }
    staticFile(path) { if (!/^\/[A-Za-z0-9._/-]+\.(?:js|css)$/.test(path) || path.includes('..'))
        return null; try {
        return readFileSync(new URL('.' + path, WEB_ROOT));
    }
    catch {
        return null;
    } }
    packageResponse(req, res) { this.system.assertPackageUnchanged(); const s = statSync(this.system.packagePath), etag = `"p2lrn-${s.size.toString(16)}-${Math.trunc(s.mtimeMs * 1e6).toString(16)}"`, modified = new Date(s.mtimeMs).toUTCString(), rh = req.headers.range, use = Boolean(rh && (!req.headers['if-range'] || [etag, modified].includes(req.headers['if-range']))), sel = use ? range(rh, s.size) : null; if (rh && use && !sel) {
        res.statusCode = 416;
        this.headers(res, 'application/vnd.p2lrn+zip', { 'Accept-Ranges': 'bytes', 'Content-Range': `bytes */${s.size}`, 'Content-Length': 0, ETag: etag, 'Last-Modified': modified });
        return res.end();
    } const [a, b] = sel ?? [0, s.size - 1]; res.statusCode = sel ? 206 : 200; this.headers(res, 'application/vnd.p2lrn+zip', { 'Accept-Ranges': 'bytes', ETag: etag, 'Last-Modified': modified, ...(sel ? { 'Content-Range': `bytes ${a}-${b}/${s.size}` } : {}), 'Content-Length': b - a + 1 }); const stream = createReadStream(this.system.packagePath, { start: a, end: b }); stream.on('error', (e) => res.destroy(e)); stream.pipe(res); }
    virtualResponse(req, res, path) { const info = this.system.virtualOuterInfo(path), s = statSync(this.system.packagePath), modified = new Date(s.mtimeMs).toUTCString(), etag = '"p2lrn-' + String(info.byteDigest).replace(/^sha256:/, '') + '"'; if (!info.seekable && info.size > MAX_VIRTUAL_DEFLATED)
        throw new ReaderSystemError('deflated virtual resource exceeds the safe materialization limit; rebuild the package with the seekable ZIP storage policy'); const rh = req.headers.range, use = Boolean(rh && (!req.headers['if-range'] || [etag, modified].includes(req.headers['if-range']))), sel = use ? range(rh, info.size) : null; if (rh && use && !sel) {
        res.statusCode = 416;
        this.headers(res, info.mediaType, { 'Accept-Ranges': 'bytes', 'Content-Range': `bytes */${info.size}`, 'Content-Length': 0, ETag: etag, 'Last-Modified': modified });
        return res.end();
    } const [a, b] = sel ?? [0, info.size - 1]; let data; if (info.seekable)
        data = this.system.reader.package.archive.bytes.slice(info.dataOffset + a, info.dataOffset + b + 1);
    else
        data = this.system.readOuter(path, MAX_VIRTUAL_DEFLATED)[0].slice(a, b + 1); res.statusCode = sel ? 206 : 200; this.headers(res, info.mediaType, { 'Accept-Ranges': 'bytes', ETag: etag, 'Last-Modified': modified, ...(sel ? { 'Content-Range': `bytes ${a}-${b}/${info.size}` } : {}), 'Content-Length': data.byteLength }); if (String(info.mediaType).split(';', 1)[0].trim().toLowerCase() === 'text/html')
        res.setHeader('Content-Security-Policy', "default-src 'self' data: blob:; script-src 'none'; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'none'"); res.end(Buffer.from(data)); }
    async start() { if (this.server)
        return this.url; this.server = createServer((req, res) => { try {
        const u = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`), p = u.pathname;
        if (p === '/health')
            return this.json(res, 200, { ok: true });
        if (!this.hostOk(req))
            return this.json(res, 403, { error: 'invalid host' });
        if (!this.auth(req, u))
            return this.json(res, 403, { error: 'invalid reader token' });
        if (p === '/')
            return this.bytes(res, 200, readFileSync(new URL('index.html', WEB_ROOT)), 'text/html; charset=utf-8', { cookie: true });
        if (p === '/package.p2lrn' || p === '/package.p2rln')
            return this.packageResponse(req, res);
        const sf = this.staticFile(p);
        if (sf)
            return this.bytes(res, 200, sf, p.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8');
        if (p === '/api/summary')
            return this.json(res, 200, this.system.summary());
        if (p === '/api/tree')
            return this.json(res, 200, this.system.tree());
        if (p === '/api/read-plan')
            return this.json(res, 200, this.system.readPlan());
        if (p === '/api/import-plan')
            return this.json(res, 200, this.system.importPlan());
        if (p === '/api/entity')
            return this.json(res, 200, this.system.entity(u.searchParams.get('id') ?? ''));
        if (p === '/api/view')
            return this.json(res, 200, this.system.viewTarget(u.searchParams.get('id') ?? '', this.token));
        if (p.startsWith('/virtual/outer/'))
            return this.virtualResponse(req, res, b64uDecode(p.slice('/virtual/outer/'.length)));
        if (p.startsWith('/virtual/web/')) {
            const rest = p.slice('/virtual/web/'.length), i = rest.indexOf('/');
            if (i < 0)
                throw new ReaderSystemError('missing web-content logical asset path');
            const rep = b64uDecode(rest.slice(0, i)), logical = decodeURIComponent(rest.slice(i + 1));
            return this.virtualResponse(req, res, this.system.resolveWebAsset(rep, logical));
        }
        if (p.startsWith('/content/outer/')) {
            const [data, type] = this.system.readOuter(b64uDecode(p.slice('/content/outer/'.length)));
            return this.bytes(res, 200, data, type, { sandbox: type.startsWith('text/html') });
        }
        if (p.startsWith('/content/package/')) {
            const rest = p.slice('/content/package/'.length), i = rest.indexOf('/');
            if (i < 0)
                throw new ReaderSystemError('missing package member');
            const pkg = b64uDecode(rest.slice(0, i)), member = decodeURIComponent(rest.slice(i + 1)), [data, type] = this.system.readPackageMember(pkg, member);
            return this.bytes(res, 200, data, type, { sandbox: type.startsWith('text/html') });
        }
        return this.json(res, 404, { error: 'not found' });
    }
    catch (e) {
        if (this.verbose)
            console.error(e);
        return this.json(res, 400, { error: e instanceof Error ? e.message : String(e) });
    } }); await new Promise((resolve, reject) => { this.server.once('error', reject); this.server.listen(this.port, this.host, () => resolve()); }); this.port = this.server.address().port; return this.url; }
    async stop() { if (!this.server)
        return; const s = this.server; this.server = undefined; await new Promise((resolve) => s.close(() => resolve())); }
}
//# sourceMappingURL=server.js.map