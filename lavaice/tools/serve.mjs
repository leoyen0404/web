/**
 * Static server for the LAVICE pages, reachable from other devices on the LAN.
 *
 *   node tools/serve.mjs            port 4174
 *   node tools/serve.mjs 8080
 *   node tools/serve.mjs 8443 --https
 *
 * Safari runs pages loaded over plain http from another machine without its
 * JIT compiler (measured: the bot is ~20x slower than the same page on
 * localhost). --https serves with a throwaway self-signed certificate
 * instead; the browser will warn once and ask whether to visit anyway.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2]) || 4174;
const HTTPS = process.argv.includes('--https');

function lanAddresses() {
    const out = [];
    for (const list of Object.values(os.networkInterfaces())) {
        for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
    }
    return out;
}

/** A self-signed certificate for localhost and this machine's LAN addresses, kept in the temp folder. */
function selfSigned() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lavice-cert-'));
    const key = path.join(dir, 'key.pem'), cert = path.join(dir, 'cert.pem');
    const san = ['DNS:localhost', 'IP:127.0.0.1', ...lanAddresses().map((a) => 'IP:' + a)].join(',');
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '30', '-subj', '/CN=LAVICE local',
        '-addext', 'subjectAltName=' + san, '-keyout', key, '-out', cert], { stdio: 'ignore' });
    return { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.md': 'text/plain; charset=utf-8' };

const handler = (req, res) => {
    let rel;
    try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { rel = '/'; }
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(ROOT, rel);
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403).end('Forbidden'); return; }
    fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404).end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(data);
    });
};

const scheme = HTTPS ? 'https' : 'http';
(HTTPS ? https.createServer(selfSigned(), handler) : http.createServer(handler)).listen(PORT, '0.0.0.0', () => {
    console.log(`${scheme}://localhost:${PORT}/`);
    for (const a of lanAddresses()) console.log(`${scheme}://${a}:${PORT}/`);
});
