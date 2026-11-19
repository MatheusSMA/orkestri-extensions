#!/usr/bin/env node
// The registry's tool. Node 20 or later, no dependencies; run it from the repository's root.
//
//   node tools/registry.mjs check [--packages <dir>]            every rule CI runs on a pull request (README.md)
//   node tools/registry.mjs keygen <private key file>           a new ed25519 key; prints its public half
//   node tools/registry.mjs add <zip> <private key file> <url>  extensions/<id>/ from a package hosted at <url>
//   node tools/registry.mjs index <registry key file> [--packages <dir>]   maintainers: index.json and index.json.sig
//
// --packages reads each package from <dir>/<file name of its url> instead of downloading it.
// The manifest rules mirror the ones the app enforces when it installs a package: keep the two in step.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// The public half of the registry key. The app carries the same key and refuses an index it does not verify.
const REGISTRY_KEY = '6LlcHznC3Aw1th4lz+WtEAVKzhOcdF187pS4LjMQcz4=';
const MANIFEST = 'orkestri-extension.json';
const MAX_PACKAGE = 50 << 20, MAX_UNPACKED = 200 << 20, MAX_TEXT = 256 << 10, MAX_ICON = 256 << 10;
const KINDS = ['contributions', 'app', 'plugin'];
const PERMISSIONS = ['process', 'localhost', 'network', 'files'];
const THEME_TOKENS = [
  'background', 'canvas_bg', 'grid_line', 'bg', 'bg_elevated', 'bg_hover', 'bg_active', 'fg', 'fg_muted', 'fg_subtle', 'border',
  'border_strong', 'accent', 'accent_soft', 'destructive', 'warning', 'success', 'sidebar_bg', 'sidebar_fg', 'sidebar_hover',
  'sidebar_active', 'sidebar_border', 'rope', 'terminal_paper', 'note_paper', 'note_ink', 'glass_rgb', 'glass_highlight', 'icon',
  'icon_soft', 'icon_softer', 'paper',
];
const MANIFEST_KEYS = ['id', 'name', 'version', 'publisher', 'description', 'minAppVersion', 'kinds', 'permissions', 'contributes'];
const RELEASE_KEYS = ['version', 'package', 'size', 'sha256', 'signature'];
const FOLDER_FILES = [MANIFEST, 'README.md', 'icon.png', 'release.json', 'CHANGELOG.md'];
const DATA_FILE = /\.(json|md|png|svg|txt)$/i;
const HOST_FLAGS = ['--host', '--bind', '--listen', '--address', '--ip', '-b', '-h'];
const PNG = Buffer.from('89504e470d0a1a0a', 'hex');
const SPKI = Buffer.from('302a300506032b6570032100', 'hex');
const PKCS8 = Buffer.from('302e020100300506032b657004220420', 'hex');

const fail = (message) => { throw new Error(message); };
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const bytes = (s) => Buffer.byteLength(s);
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const KEY = /^[A-Za-z0-9+/]{43}=$/, SIGNATURE = /^[A-Za-z0-9+/]{86}==$/;

function parse(data, name) {
  try {
    return JSON.parse(data.toString('utf8'));
  } catch (e) {
    fail(`${name}: ${e.message}`);
  }
}

// ---- keys and signatures (ed25519 over the exact bytes; keys and signatures in base64) ------------------------------

function privateKey(file) {
  const seed = Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'base64');
  if (seed.length !== 32) fail(`${file} must hold a 32-byte ed25519 key in base64`);
  return crypto.createPrivateKey({ key: Buffer.concat([PKCS8, seed]), format: 'der', type: 'pkcs8' });
}

const publicOf = (key) => crypto.createPublicKey(key).export({ format: 'der', type: 'spki' }).subarray(SPKI.length).toString('base64');

function verifies(key, signature, data) {
  if (!KEY.test(key ?? '') || !SIGNATURE.test(signature ?? '')) return false;
  const pub = crypto.createPublicKey({ key: Buffer.concat([SPKI, Buffer.from(key, 'base64')]), format: 'der', type: 'spki' });
  return crypto.verify(null, data, pub, Buffer.from(signature, 'base64'));
}

// ---- the manifest rules ---------------------------------------------------------------------------------------------

const version = (v) => (typeof v === 'string' && /^\d+\.\d+\.\d+$/.test(v) ? v.split('.').map(Number) : null);
function newer(a, b) {
  const [x, y] = [version(a), version(b)];
  if (!x || !y) return false;
  const i = x.findIndex((n, i) => n !== y[i]);
  return i >= 0 && x[i] > y[i];
}
const word = (w) => w.length > 0 && w.length <= 40 && !w.startsWith('-') && /^[a-z0-9-]+$/.test(w);
const validId = (id) => typeof id === 'string' && id.includes('.') && word(id.slice(0, id.indexOf('.'))) && word(id.slice(id.indexOf('.') + 1));
const color = (c) => typeof c === 'string' && /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(c);

// A path written in a manifest: relative, inside the package.
function inside(rel) {
  const parts = rel.split(/[\\/]/);
  if (!rel || parts.some((p) => !p || p === '.' || p === '..' || p.includes(':'))) fail(`path ${JSON.stringify(rel)} must stay inside the extension`);
  return parts.join('/');
}

// `files`: the package's files by path. Throws the first broken rule.
function validate(m, files) {
  if (!isObject(m)) fail('the manifest must be an object');
  const unknown = Object.keys(m).find((k) => !MANIFEST_KEYS.includes(k));
  if (unknown) fail(`unknown key ${JSON.stringify(unknown)}`);
  const s = (k) => (typeof m[k] === 'string' ? m[k] : '');
  if (!validId(s('id'))) fail(`invalid id ${JSON.stringify(s('id'))} (publisher.name)`);
  if (s('publisher') !== s('id').split('.')[0]) fail('publisher must be the first part of the id');
  if (!s('name').trim() || bytes(s('name')) > 100) fail('name must have 1 to 100 characters');
  if (!version(s('version'))) fail('version must be x.y.z');
  if ('minAppVersion' in m && !version(m.minAppVersion)) fail('minAppVersion must be x.y.z');
  if ('description' in m && (typeof m.description !== 'string' || bytes(m.description) > 500)) fail('description must be a text up to 500 characters');
  const list = (k, allowed) => {
    if (!(k in m)) return [];
    if (!Array.isArray(m[k])) fail(`${k} must be a list`);
    const items = m[k].map((i) => (typeof i === 'string' ? i : '?'));
    const bad = items.find((i) => !allowed.includes(i));
    if (bad !== undefined) fail(`unknown ${k} entry ${JSON.stringify(bad)}`);
    return items;
  };
  const kinds = list('kinds', KINDS);
  const permissions = list('permissions', PERMISSIONS);
  if (!kinds.length) fail('kinds must name at least one kind');
  if (kinds.includes('plugin')) fail('plugin extensions (WebAssembly) are not supported yet');
  if ('contributes' in m && !isObject(m.contributes)) fail('contributes must be an object');
  for (const [key, items] of Object.entries(m.contributes ?? {})) {
    if (!['themes', 'terminalPresets', 'prompts', 'apps'].includes(key)) fail(`contributes.${key} is not supported yet`);
    if (!Array.isArray(items)) fail(`contributes.${key} must be a list`);
    const kind = key === 'apps' ? 'app' : 'contributions';
    if (!kinds.includes(kind)) fail(`contributes.${key} needs the kind "${kind}"`);
    for (const item of items) {
      const t = (k) => (isObject(item) && typeof item[k] === 'string' ? item[k] : '');
      const has = (k) => isObject(item) && k in item;
      const short = (k, max) => (!t(k).trim() || bytes(t(k)) > max) && fail(`contributes.${key}: ${k} must have 1 to ${max} characters`);
      const named = (k) => !word(t(k)) && fail(`contributes.${key}: invalid ${k} ${JSON.stringify(t(k))}`);
      if (key === 'themes') {
        named('id');
        short('label', 100);
        if (!['light', 'dark'].includes(t('base'))) fail('contributes.themes: base must be light or dark');
        if (!isObject(item.colors)) fail('contributes.themes: colors must be an object');
        for (const [token, value] of Object.entries(item.colors)) {
          if (!THEME_TOKENS.includes(token)) fail(`contributes.themes: unknown token ${JSON.stringify(token)}`);
          if (!color(value)) fail(`contributes.themes: ${token} must be #rgb, #rgba, #rrggbb or #rrggbbaa`);
        }
      } else if (key === 'terminalPresets') {
        named('id');
        short('name', 200);
        if (typeof item.command !== 'string' || bytes(item.command) > 2000) fail('contributes.terminalPresets: command must be a text');
      } else if (key === 'prompts') {
        short('name', 200);
        const file = files.get(inside(t('file'))) ?? fail(`contributes.prompts: ${t('file')} is missing`);
        if (file.length > MAX_TEXT || !utf8(file)) fail(`contributes.prompts: ${t('file')} must be UTF-8 text up to 256 KB`);
      } else {
        named('id');
        short('name', 100);
        short('command', 2000);
        if (!permissions.includes('process') || !permissions.includes('localhost')) fail('an app needs the permissions "process" and "localhost"');
        if (has('args') && !(Array.isArray(item.args) && item.args.every((a) => typeof a === 'string'))) fail('contributes.apps: args must be a list of texts');
        if (has('env') && !(isObject(item.env) && Object.values(item.env).every((v) => typeof v === 'string'))) fail('contributes.apps: env must map names to texts');
        const port = item.port;
        if (!(port === undefined || port === null || port === 'auto' || (Number.isInteger(port) && port >= 1024 && port <= 65535))) fail('contributes.apps: port must be "auto" or 1024..65535');
        for (const k of ['health', 'path']) if (has(k) && !t(k).startsWith('/')) fail(`contributes.apps: ${k} must start with /`);
        const timeout = item.startTimeoutMs;
        if (has('startTimeoutMs') && !(Number.isInteger(timeout) && timeout >= 0 && timeout <= 300000)) fail('contributes.apps: startTimeoutMs must be at most 300000');
      }
    }
  }
}

function utf8(data) {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(data);
    return true;
  } catch {
    return false;
  }
}

// ---- packages -------------------------------------------------------------------------------------------------------

// The files of a zip, by path ("./" stripped). Refuses links, paths out of the package, zip64, encryption, and more than
// MAX_UNPACKED bytes unpacked.
function unzip(buf) {
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) fail('the package is not a zip');
  const files = new Map();
  let p = buf.readUInt32LE(end + 16), total = 0;
  for (let n = buf.readUInt16LE(end + 10); n > 0; n--) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) fail('broken zip (central directory)');
    const flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10);
    const packed = buf.readUInt32LE(p + 20), size = buf.readUInt32LE(p + 24), local = buf.readUInt32LE(p + 42);
    const mode = buf.readUInt16LE(p + 4) >> 8 === 3 ? buf.readUInt32LE(p + 38) >>> 16 : 0;
    const raw = buf.toString('utf8', p + 46, p + 46 + buf.readUInt16LE(p + 28));
    p += 46 + buf.readUInt16LE(p + 28) + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
    const name = raw.replace(/^(\.\/)+/, '');
    if ((mode & 0o170000) === 0o120000) fail(`the package holds a link: ${raw}`);
    if (name === '' ) continue;
    const parts = name.replace(/\/$/, '').split('/');
    if (raw.includes('\\') || parts.some((x) => !x || x === '.' || x === '..' || x.includes(':'))) fail(`unsafe path in the package: ${raw}`);
    if (name.endsWith('/')) continue;
    if (flags & 1) fail(`encrypted file in the package: ${raw}`);
    if ([packed, size, local].includes(0xffffffff)) fail('zip64 packages are not accepted');
    const nameLen = buf.readUInt16LE(local + 26);
    if (buf.readUInt32LE(local) !== 0x04034b50 || buf.toString('utf8', local + 30, local + 30 + nameLen) !== raw) fail(`broken zip (local header of ${raw})`);
    const start = local + 30 + nameLen + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + packed);
    const out = method === 0 ? data : method === 8 ? zlib.inflateRawSync(data, { maxOutputLength: MAX_UNPACKED + 1 }) : fail(`unknown compression in ${raw}`);
    if (out.length !== size) fail(`broken zip (size of ${raw})`);
    if ((total += size) > MAX_UNPACKED) fail(`the package unpacks to more than ${MAX_UNPACKED >> 20} MB`);
    if (files.has(name)) fail(`the package holds ${name} twice`);
    files.set(name, out);
  }
  return files;
}

async function packageBytes(url, packages) {
  if (packages) return fs.readFileSync(path.join(packages, path.posix.basename(new URL(url).pathname)));
  const res = await fetch(url);
  if (!res.ok) fail(`${url}: HTTP ${res.status}`);
  if (Number(res.headers.get('content-length')) > MAX_PACKAGE) fail(`the package is bigger than ${MAX_PACKAGE >> 20} MB`);
  return Buffer.from(await res.arrayBuffer());
}

// ---- the registry ---------------------------------------------------------------------------------------------------

const ls = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []);

function publishers() {
  const out = {};
  for (const file of ls('publishers')) {
    const name = file.replace(/\.json$/, '');
    if (!file.endsWith('.json') || !word(name)) fail(`publishers/${file}: the file must be <publisher>.json, lower case letters, digits and dashes`);
    const p = parse(fs.readFileSync(path.join('publishers', file)), `publishers/${file}`);
    if (!isObject(p) || Object.keys(p).sort().join() !== 'github,key') fail(`publishers/${file} must be { "key", "github" }`);
    if (!KEY.test(p.key)) fail(`publishers/${file}: key must be a 32-byte ed25519 public key in base64`);
    if (typeof p.github !== 'string' || !/^[A-Za-z0-9-]{1,39}$/.test(p.github)) fail(`publishers/${file}: github must be a GitHub login`);
    out[name] = { key: p.key, github: p.github };
  }
  return out;
}

// One folder of extensions/: its files, its release (size, sha256, publisher signature) and the package itself.
async function checkExtension(id, pubs, packages) {
  if (!validId(id)) fail('the folder must be named after the extension id (publisher.name)');
  const dir = path.join('extensions', id);
  const present = ls(dir);
  const stray = present.find((f) => !FOLDER_FILES.includes(f));
  if (stray) fail(`unexpected file ${stray} (a folder holds ${FOLDER_FILES.join(', ')})`);
  const missing = FOLDER_FILES.slice(0, 4).find((f) => !present.includes(f));
  if (missing) fail(`${missing} is missing`);
  const icon = fs.readFileSync(path.join(dir, 'icon.png'));
  if (!icon.subarray(0, 8).equals(PNG) || icon.length > MAX_ICON) fail('icon.png must be a PNG up to 256 KB');
  const manifestBytes = fs.readFileSync(path.join(dir, MANIFEST));
  const m = parse(manifestBytes, MANIFEST);
  if (!isObject(m) || m.id !== id) fail('the folder is not named after the manifest id');
  const pub = pubs[m.publisher] ?? fail(`publisher ${JSON.stringify(m.publisher)} is not registered (publishers/<name>.json)`);
  const r = parse(fs.readFileSync(path.join(dir, 'release.json')), 'release.json');
  if (!isObject(r) || Object.keys(r).sort().join() !== [...RELEASE_KEYS].sort().join()) fail(`release.json must be { ${RELEASE_KEYS.join(', ')} }`);
  if (r.version !== m.version) fail('release.json: version differs from the manifest');
  if (typeof r.package !== 'string' || !r.package.startsWith('https://')) fail('release.json: package must be an https address');
  if (!/^[0-9a-f]{64}$/.test(r.sha256)) fail('release.json: sha256 must be 64 hex digits');
  const data = await packageBytes(r.package, packages);
  if (data.length > MAX_PACKAGE) fail(`the package is bigger than ${MAX_PACKAGE >> 20} MB`);
  if (data.length !== r.size) fail(`release.json: size ${r.size}, the package has ${data.length} bytes`);
  if (sha256(data) !== r.sha256) fail('the package does not match release.json (sha256)');
  if (!verifies(pub.key, r.signature, data)) fail(`the package signature does not verify with the key of ${m.publisher}`);
  const files = unzip(data);
  if (!files.get(MANIFEST)?.equals(manifestBytes)) fail(`${MANIFEST} differs from the one at the root of the package`);
  validate(m, files);
  if (!m.kinds.includes('app')) {
    const code = [...files.keys()].find((f) => !DATA_FILE.test(f));
    if (code) fail(`a contributions package holds only data files (json, md, png, svg, txt): ${code}`);
  }
  return { manifest: m, release: r };
}

// What a person must look at before a merge: new permissions, network, new programs, servers beyond 127.0.0.1.
function surprises(old, m) {
  const out = [];
  const before = old?.permissions ?? [];
  for (const p of m.permissions ?? []) if (!before.includes(p)) out.push(`asks for a new permission: ${p}`);
  if ((m.permissions ?? []).includes('network')) out.push('can reach the internet (network)');
  const run = (a) => JSON.stringify([a.command, a.args ?? [], a.env ?? {}]);
  const known = new Map((old?.contributes?.apps ?? []).map((a) => [a.id, run(a)]));
  for (const a of m.contributes?.apps ?? []) {
    if (known.get(a.id) !== run(a)) out.push(`app ${a.id} runs a new command: ${[a.command, ...(a.args ?? [])].join(' ')}`);
    if (!local(a.args ?? [])) out.push(`app ${a.id} may serve on more than 127.0.0.1`);
  }
  return out;
}

// ponytail: the usual host flags only; any new or changed command is flagged above anyway, so a person reads it.
function local(args) {
  return args.every((a, i) => {
    const eq = a.startsWith('-') ? a.indexOf('=') : -1;
    const [flag, value] = eq > 0 ? [a.slice(0, eq), a.slice(eq + 1)] : [args[i - 1], a];
    return !a.includes('0.0.0.0') && !a.includes('::') && (!HOST_FLAGS.includes(flag) || value === '127.0.0.1');
  });
}

// A pull request (BASE: the base commit, AUTHOR: its GitHub login): who may change what, versions, what needs a review.
function pullRequest(base, author, pubs, exts, errors, flags) {
  const atBase = (file) => {
    try {
      return parse(execFileSync('git', ['show', `${base}:${file}`], { stdio: ['ignore', 'pipe', 'ignore'] }), `${base}:${file}`);
    } catch {
      return null;
    }
  };
  const changed = execFileSync('git', ['diff', '--name-only', base, 'HEAD'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  const ids = new Set(), names = new Set();
  for (const f of changed) {
    const [top, sub] = f.split('/');
    if (f === 'index.json' || f === 'index.json.sig') errors.push(`${f} is generated and signed by the maintainers after a merge: leave it out of the pull request`);
    else if (top === 'extensions' && sub) ids.add(sub);
    else if (top === 'publishers' && sub) names.add(sub.replace(/\.json$/, ''));
    else flags.push(`changes ${f}, outside extensions/ and publishers/`);
  }
  const owns = (login) => !author || login?.toLowerCase() === author.toLowerCase();
  for (const name of names) {
    const old = atBase(`publishers/${name}.json`), now = pubs[name];
    if (old && !owns(old.github)) errors.push(`publishers/${name}.json: only ${old.github} can change it`);
    if (!old && now && !owns(now.github)) errors.push(`publishers/${name}.json must be added by its own GitHub account (${now.github})`);
    if (old && !now) flags.push(`removes the publisher ${name}`);
    if (old && now && (old.key !== now.key || old.github !== now.github)) flags.push(`publisher ${name} changes its key or GitHub account`);
  }
  for (const id of ids) {
    const old = atBase(`extensions/${id}/${MANIFEST}`), now = exts[id]?.manifest;
    const login = pubs[(now ?? old)?.publisher]?.github ?? atBase(`publishers/${old?.publisher}.json`)?.github;
    if (!owns(login)) errors.push(`extensions/${id}: only its publisher's GitHub account (${login}) can change it`);
    if (!now) {
      if (!fs.existsSync(path.join('extensions', id))) flags.push(`removes the extension ${id}`);
      continue;
    }
    if (old && !newer(now.version, old.version)) errors.push(`extensions/${id}: version ${now.version} must be newer than ${old.version}`);
    flags.push(...surprises(old, now).map((s) => `${id}: ${s}`));
  }
}

function indexText(pubs) {
  const extensions = ls('extensions').map((id) => {
    const m = parse(fs.readFileSync(path.join('extensions', id, MANIFEST)), MANIFEST);
    const r = parse(fs.readFileSync(path.join('extensions', id, 'release.json')), 'release.json');
    return { id: m.id, name: m.name, version: m.version, publisher: m.publisher, description: m.description ?? '', kinds: m.kinds,
      permissions: m.permissions ?? [], package: r.package, size: r.size, sha256: r.sha256, signature: r.signature };
  });
  return JSON.stringify({ version: 1, publishers: pubs, extensions }, null, 2) + '\n';
}

// Every rule on the registry as it stands: publishers and each extension with its package.
async function checkAll(packages, errors) {
  let pubs = {};
  try {
    pubs = publishers();
  } catch (e) {
    errors.push(e.message);
  }
  const exts = {};
  for (const id of ls('extensions')) {
    try {
      exts[id] = await checkExtension(id, pubs, packages);
    } catch (e) {
      errors.push(`extensions/${id}: ${e.message}`);
    }
  }
  return { pubs, exts };
}

async function check(packages) {
  const errors = [], flags = [];
  const { pubs, exts } = await checkAll(packages, errors);
  if (process.env.BASE) {
    pullRequest(process.env.BASE, process.env.AUTHOR, pubs, exts, errors, flags);
  } else if (!errors.length) {
    if (!fs.existsSync('index.json') || fs.readFileSync('index.json', 'utf8') !== indexText(pubs)) errors.push('index.json is not the index of this registry: a maintainer runs `node tools/registry.mjs index <key>`');
    else if (!verifies(REGISTRY_KEY, fs.existsSync('index.json.sig') ? fs.readFileSync('index.json.sig', 'utf8').trim() : '', fs.readFileSync('index.json'))) errors.push('index.json.sig does not verify with the registry key');
  }
  const reviewed = process.env.REVIEWED === 'true';
  const gh = process.env.GITHUB_ACTIONS === 'true';
  if (flags.length && !reviewed) errors.push(`${flags.length} point(s) need a maintainer's review: the label permissions-reviewed accepts them`);
  for (const e of errors) console.log(`${gh ? '::error::' : 'error: '}${e}`);
  for (const f of flags) console.log(`${gh ? '::warning::' : 'review: '}${f}`);
  if (process.env.GITHUB_STEP_SUMMARY && flags.length) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Needs a maintainer's review\n\n${flags.map((f) => `- ${f}`).join('\n')}\n\n${reviewed ? 'Reviewed (label `permissions-reviewed`).' : 'A maintainer reviews the points above and adds the label `permissions-reviewed`.'}\n`);
  }
  console.log(errors.length ? `${errors.length} problem(s)` : `ok: ${Object.keys(exts).length} extension(s), ${Object.keys(pubs).length} publisher(s)`);
  process.exitCode = errors.length ? 1 : 0;
}

function keygen(file) {
  if (fs.existsSync(file)) fail(`${file} exists: a key is made once (the registry and the app trust only its public half)`);
  const { privateKey: key } = crypto.generateKeyPairSync('ed25519');
  const seed = Buffer.from(key.export({ format: 'jwk' }).d, 'base64url');
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, seed.toString('base64') + '\n', { mode: 0o600 });
  console.log(publicOf(key));
}

function add(zip, keyFile, url) {
  if (!url?.startsWith('https://')) fail('the package address must be https');
  const data = fs.readFileSync(zip);
  if (data.length > MAX_PACKAGE) fail(`the package is bigger than ${MAX_PACKAGE >> 20} MB`);
  const files = unzip(data);
  const manifest = files.get(MANIFEST) ?? fail(`${MANIFEST} must be at the root of the zip`);
  const m = parse(manifest, MANIFEST);
  validate(m, files);
  const key = privateKey(keyFile);
  const pub = fs.existsSync('publishers') ? publishers()[m.publisher] : undefined;
  if (pub && pub.key !== publicOf(key)) fail(`the key is not the one in publishers/${m.publisher}.json`);
  const extras = ['README.md', 'icon.png'].map((f) => [f, files.get(f) ?? fail(`${f} must be at the root of the zip`)]);
  const dir = path.join('extensions', m.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, MANIFEST), manifest);
  for (const [f, content] of extras) fs.writeFileSync(path.join(dir, f), content);
  const release = { version: m.version, package: url, size: data.length, sha256: sha256(data), signature: crypto.sign(null, data, key).toString('base64') };
  fs.writeFileSync(path.join(dir, 'release.json'), JSON.stringify(release, null, 2) + '\n');
  console.log(`wrote ${dir}`);
  if (!pub) console.log(`publishers/${m.publisher}.json is missing; add { "key": "${publicOf(key)}", "github": "<your GitHub login>" }`);
}

async function index(keyFile, packages) {
  const key = privateKey(keyFile);
  if (publicOf(key) !== REGISTRY_KEY) fail('this is not the registry key (the app would refuse what it signs)');
  const errors = [];
  const { pubs } = await checkAll(packages, errors);
  if (errors.length) fail(`the registry has problems, nothing written:\n${errors.join('\n')}`);
  const text = Buffer.from(indexText(pubs));
  fs.writeFileSync('index.json', text);
  fs.writeFileSync('index.json.sig', crypto.sign(null, text, key).toString('base64') + '\n');
  console.log(`index.json: ${JSON.parse(text).extensions.length} extension(s), signed`);
}

export { validate, unzip, surprises };

// The command line, when run (the tests import the rules).
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [command, ...rest] = process.argv.slice(2);
  const option = (name) => (rest.includes(name) ? rest[rest.indexOf(name) + 1] : undefined);
  const plain = rest.filter((a, i) => !a.startsWith('--') && !rest[i - 1]?.startsWith('--'));
  try {
    if (command === 'check') await check(option('--packages'));
    else if (command === 'keygen' && plain.length === 1) keygen(plain[0]);
    else if (command === 'add' && plain.length === 3) add(...plain);
    else if (command === 'index' && plain.length === 1) await index(plain[0], option('--packages'));
    else fail('usage: node tools/registry.mjs check [--packages <dir>] | keygen <key file> | add <zip> <key file> <https url> | index <registry key file> [--packages <dir>]');
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
