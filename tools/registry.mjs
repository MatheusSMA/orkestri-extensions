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
// The built-in card kinds an extension unlocks (`contributes.cards`): Orkestri draws them, the extension brings what
// they run on (the notebook cells: a Python with ipykernel).
const CARDS = ['notebookCell', 'serviceBlock', 'docker', 'ssh', 'dictation', 'music'];
const PERMISSIONS = ['process', 'localhost', 'network', 'files'];
const THEME_TOKENS = [
  'background', 'canvas_bg', 'grid_line', 'bg', 'bg_elevated', 'bg_hover', 'bg_active', 'fg', 'fg_muted', 'fg_subtle', 'border',
  'border_strong', 'accent', 'accent_soft', 'accent_text', 'destructive', 'warning', 'success', 'sidebar_bg', 'sidebar_fg', 'sidebar_hover',
  'sidebar_active', 'sidebar_border', 'rope', 'link_active', 'terminal_paper', 'card_rim', 'note_paper', 'note_ink', 'glass_rgb', 'glass_highlight', 'icon',
  'icon_soft', 'icon_softer', 'paper',
];
const MANIFEST_KEYS = ['id', 'name', 'version', 'publisher', 'author', 'authorUrl', 'description', 'minAppVersion', 'kinds', 'permissions', 'contributes', 'icon', 'agents'];
// An agent manual is short: every agent in Orkestri gets it in its skill.
const MAX_MANUAL = 4096;
// The largest icon file a manifest may name: the index carries it (a data: address), signed with the rest.
const MAX_MANIFEST_ICON = 64 << 10;
const RELEASE_KEYS = ['version', 'package', 'size', 'sha256', 'signature'];
const FOLDER_FILES = [MANIFEST, 'README.md', 'icon.png', 'release.json', 'CHANGELOG.md'];
const DATA_FILE = /\.(json|md|png|svg|txt)$/i;
// A theme's backdrop (Orkestri BUGS #118): one of the animated templates Orkestri draws, or a picture or video of the
// package, 20 MB at most each (the app's ork_ext rules).
const BACKDROP_TEMPLATES = ['drift', 'bokeh', 'aurora', 'stars', 'rain', 'waves', 'pulse', 'ripples', 'glow', 'smoke', 'fog'];
const BACKDROP_FILE = /\.(png|jpe?g|webp|gif|mp4)$/i;
const MAX_BACKDROP = 20 << 20;
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

// A theme's backdrop at `at`: `{ template | file, fit, dim, blur, grid }`. Answers its file's path, if it names one.
function backdrop(b, files, at) {
  if (!isObject(b)) fail(`${at}: must be an object`);
  const key = Object.keys(b).find((k) => !['template', 'file', 'fit', 'dim', 'blur', 'grid'].includes(k));
  if (key) fail(`${at}: unknown key ${JSON.stringify(key)}`);
  if (('template' in b) === ('file' in b)) fail(`${at}: needs a template or a file, not both`);
  if ('template' in b && !BACKDROP_TEMPLATES.includes(b.template)) fail(`${at}: unknown template ${JSON.stringify(b.template)} (one of ${BACKDROP_TEMPLATES.join(', ')})`);
  let file = null;
  if ('file' in b) {
    file = inside(typeof b.file === 'string' ? b.file : '');
    if (!BACKDROP_FILE.test(file)) fail(`${at}: file must be png, jpg, jpeg, webp, gif or mp4`);
    const data = files.get(file) ?? fail(`${at}: ${file} is missing`);
    if (data.length > MAX_BACKDROP) fail(`${at}: ${file} is larger than ${MAX_BACKDROP >> 20} MB`);
  }
  if ('fit' in b && !['cover', 'contain', 'stretch'].includes(b.fit)) fail(`${at}: fit must be cover, contain or stretch`);
  for (const [k, max] of [['dim', 1], ['blur', 40]]) {
    if (k in b && !(typeof b[k] === 'number' && b[k] >= 0 && b[k] <= max)) fail(`${at}: ${k} must be a number from 0 to ${max}`);
  }
  if ('grid' in b && typeof b.grid !== 'boolean') fail(`${at}: grid must be true or false`);
  return file;
}

// The files a contributions package may hold: data files, and the backdrop files its themes name.
function contents(m, files) {
  if (m.kinds.includes('app')) return;
  const named = new Set((m.contributes?.themes ?? []).flatMap((t) => ['backdrop', 'terminalBackdrop'].filter((k) => isObject(t?.[k]) && typeof t[k].file === 'string').map((k) => inside(t[k].file))));
  const code = [...files.keys()].find((f) => !DATA_FILE.test(f) && !named.has(f));
  if (code) fail(`a contributions package holds only data files (json, md, png, svg, txt) and the backdrop files its themes name (png, jpg, jpeg, webp, gif, mp4): ${code}`);
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
  // Who made the content (a theme's colours, a port of someone's work), shown as its author; the publisher signs it.
  if ('author' in m && (typeof m.author !== 'string' || !m.author.trim() || bytes(m.author) > 100)) fail('author must have 1 to 100 characters');
  if ('authorUrl' in m && (typeof m.authorUrl !== 'string' || !m.authorUrl.startsWith('https://') || bytes(m.authorUrl) > 2000)) fail('authorUrl must be an https address');
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
  iconOf(m, files);
  // Whether its agents' manual offers `orkestri code` ops: then each app answers them with its controller (BUGS #94).
  let codeOps = false;
  // Its manual's text (empty when agents is false): a terminal's says how Orkestri works inside it (BUGS #98).
  let manualText = '';
  // Whether it works with the agents, said by every extension; if it does, the manual they get (a file of the package).
  if (m.agents !== false) {
    const manual = isObject(m.agents) && Object.keys(m.agents).join() === 'manual' && typeof m.agents.manual === 'string' ? m.agents.manual
      : fail('agents is required: false, or { "manual": "<file>" } when agents can use the extension');
    const text = files.get(inside(manual)) ?? fail(`agents.manual: ${manual} is missing`);
    if (text.length > MAX_MANUAL || !utf8(text)) fail(`agents.manual must be UTF-8 text up to ${MAX_MANUAL} bytes`);
    manualText = text.toString('utf8');
    codeOps = manualText.includes('orkestri code');
  }
  if ('contributes' in m && !isObject(m.contributes)) fail('contributes must be an object');
  for (const [key, items] of Object.entries(m.contributes ?? {})) {
    if (!['themes', 'terminalPresets', 'prompts', 'apps', 'cards'].includes(key)) fail(`contributes.${key} is not supported yet`);
    if (!Array.isArray(items)) fail(`contributes.${key} must be a list`);
    const kind = key === 'apps' || key === 'cards' ? 'app' : 'contributions';
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
        for (const k of ['backdrop', 'terminalBackdrop']) if (has(k)) backdrop(item[k], files, `contributes.themes: ${k}`);
      } else if (key === 'terminalPresets') {
        named('id');
        short('name', 200);
        if (typeof item.command !== 'string' || bytes(item.command) > 2000) fail('contributes.terminalPresets: command must be a text');
      } else if (key === 'cards' && isObject(item) && item.kind === 'serviceBlock') {
        // Blocks of a service app of the package (BUGS #110, n8n's nodes): its controller answers all they need.
        named('id');
        const service = (m.contributes.apps ?? []).some((a) => isObject(a) && a.id === item.service && a.service === true);
        if (!service || Object.keys(item).some((k) => !['id', 'kind', 'service'].includes(k))) fail('contributes.cards: a serviceBlock card is { id, kind, service }, service a service app of the package');
      } else if (key === 'cards') {
        // A built-in card kind it unlocks and what that card runs on, prepared as an app's program (download, setup).
        named('id');
        if (!CARDS.includes(t('kind'))) fail(`contributes.cards: kind must be one of ${CARDS.join(', ')}`);
        if (!isObject(item) || Object.keys(item).some((k) => !['id', 'kind', 'download', 'setup', 'path', 'controller', 'os'].includes(k))) fail('contributes.cards: an entry is { id, kind, download, setup, controller } or { id, kind, path, controller }');
        if (item.os !== undefined && !['windows', 'linux'].includes(item.os)) fail('contributes.cards: os must be "windows" or "linux"');
        // What the card talks to is the package's (Jupyter's kernel.py on its own Python): Orkestri keeps it alive.
        if (!commandLine(item.controller)) fail('contributes.cards: controller must be { command, args, env } (what the card talks to comes with the package)');
        if (['controller', 'download', 'setup', 'path'].some((k) => item[k] !== undefined) && !permissions.includes('process')) fail('a card that runs a program needs the permission "process"');
        // Or a folder of the package that holds it all (Jupyter's Python with ipykernel, shipped inside).
        if (has('path')) {
          const folder = inside(t('path'));
          if (![...files.keys()].some((f) => f.startsWith(`${folder}/`))) fail('contributes.cards: path must be a folder of the package');
          if (has('download') || has('setup')) fail('contributes.cards: path is instead of download and setup');
        }
        downloadRule(key, item, permissions);
        setupRule(key, item);
      } else if (key === 'prompts') {
        short('name', 200);
        const file = files.get(inside(t('file'))) ?? fail(`contributes.prompts: ${t('file')} is missing`);
        if (file.length > MAX_TEXT || !utf8(file)) fail(`contributes.prompts: ${t('file')} must be UTF-8 text up to 256 KB`);
      } else if (has('item')) {
        // An item card (BUGS #102), drawn by Orkestri, of one thing a service app of the package holds (an n8n
        // workflow): its data and actions are that service's controller's, it runs nothing of its own.
        named('id');
        short('name', 100);
        const service = items.some((a) => isObject(a) && a.id === item.item && a.service === true);
        if (!service || Object.keys(item).some((k) => !['id', 'name', 'icon', 'item'].includes(k))) fail('contributes.apps: item names a service app of the package ("service": true); an item app is { id, name, icon, item }');
        if (!(typeof item.icon === 'string' && word(item.icon))) fail('contributes.apps: icon must be a glyph name (the canvas menu and the card show it)');
      } else {
        named('id');
        short('name', 100);
        short('command', 2000);
        // A window app is a program's own window shown in a card (VSCodium): no local server.
        const window = has('window') ? item.window : false;
        if (typeof window !== 'boolean') fail('contributes.apps: window must be true or false');
        if (window && !permissions.includes('process')) fail('a window app needs the permission "process"');
        if (!window && (!permissions.includes('process') || !permissions.includes('localhost'))) fail('an app needs the permissions "process" and "localhost"');
        downloadRule(key, item, permissions);
        // An interpreter the computer may already have (n8n on Node.js): the files its folder holds (the first its
        // program) and the start of what `--version` answers; its `download` is fetched only when PATH has none.
        if (has('runtime')) {
          const r = item.runtime;
          const relative = (f) => typeof f === 'string' && f.length > 0 && f.split(/[\\/]/).every((p) => p && p !== '.' && p !== '..' && !p.includes(':'));
          const ok = isObject(r) && Object.keys(r).sort().join() === 'files,version' && Array.isArray(r.files) && r.files.length >= 1 && r.files.length <= 4
            && r.files.every(relative) && typeof r.version === 'string' && r.version.length >= 1 && r.version.length <= 40 && has('download');
          if (!ok) fail('contributes.apps: runtime must be { files (1 to 4 relative paths), version (the start of what --version answers) } of an app with a download');
        }
        // The person's own install of the program (Zed in %LOCALAPPDATA%\Programs): folders that stand for ${appPath}.
        if (has('installed')) {
          const i = item.installed;
          const folder = (p) => typeof p === 'string' && p.length <= 260 && ['{LocalAppData}', '{ProgramFiles}'].some((k) => p === k || p.startsWith(`${k}\\`)) && !p.split(/[\\/]/).includes('..');
          const ok = Array.isArray(i) && i.length >= 1 && i.length <= 8 && i.every(folder) && t('command').startsWith('${appPath}') && has('download');
          if (!ok) fail('contributes.apps: installed must be 1 to 8 folders under {LocalAppData}\\ or {ProgramFiles}\\ of an app with a download whose command is under ${appPath}');
        }
        if (!(typeof item.icon === 'string' && word(item.icon))) fail('contributes.apps: icon must be a glyph name (the canvas menu and the card show it)');
        if (has('defaults')) {
          const folder = inside(t('defaults'));
          if (![...files.keys()].some((f) => f.startsWith(`${folder}/`))) fail('contributes.apps: defaults must be a folder of the extension');
        }
        for (const k of ['args', 'openFolder']) if (has(k) && !(Array.isArray(item[k]) && item[k].every((a) => typeof a === 'string'))) fail(`contributes.apps: ${k} must be a list of texts`);
        if (has('env') && !(isObject(item.env) && Object.values(item.env).every((v) => typeof v === 'string'))) fail('contributes.apps: env must map names to texts');
        const port = item.port;
        if (!(port === undefined || port === null || port === 'auto' || (Number.isInteger(port) && port >= 1024 && port <= 65535))) fail('contributes.apps: port must be "auto" or 1024..65535');
        for (const k of ['health', 'path']) if (has(k) && !t(k).startsWith('/')) fail(`contributes.apps: ${k} must start with /`);
        setupRule(key, item);
        // A window app with no bridge (Zed): the settings file of the card's folder it reads live and its font sizes at
        // zoom 1 (Orkestri scales them with the canvas), and/or (BUGS #104, Orkestri 0.1.11) `percent`, the key of the
        // program's zoom of its whole UI, written as a whole percent (Warp's tab bar does not follow its font size).
        if (has('zoom')) {
          const z = item.zoom;
          const key = (k) => typeof k === 'string' && k.split('.').every((p) => word(p.replaceAll('_', '-')));
          const file = isObject(z) && typeof z.file === 'string' && !z.file.includes(':') && !/^[\\/]/.test(z.file) && !z.file.split(/[\\/]/).some((p) => !p || p === '.' || p === '..');
          const sizes = isObject(z) && isObject(z.sizes) && Object.keys(z.sizes).length >= 1 && Object.keys(z.sizes).length <= 8
            && Object.entries(z.sizes).every(([k, v]) => key(k) && typeof v === 'number' && v >= 4 && v <= 100);
          // Orkestri 0.1.30 (BUGS #218): `fixed`, up to 8 settings written as they are with the sizes (a number, a switch or a
          // short text): Warp's tab bar only on hover.
          const fixed = isObject(z) && isObject(z.fixed) && Object.keys(z.fixed).length >= 1 && Object.keys(z.fixed).length <= 8
            && Object.entries(z.fixed).every(([k, v]) => key(k) && (typeof v === 'number' || typeof v === 'boolean' || (typeof v === 'string' && v.length <= 64 && !/["\\\n]/.test(v))));
          const known = isObject(z) && Object.keys(z).every((k) => ['file', 'sizes', 'percent', 'fixed'].includes(k));
          if (!window || !known || !file || ('sizes' in z && !sizes) || ('percent' in z && !key(z.percent)) || ('fixed' in z && !fixed) || !('sizes' in z || 'percent' in z)) {
            fail('contributes.apps: zoom must be { file (a relative path), sizes (1 to 8 names to sizes 4..100) and/or percent (a name), fixed (1 to 8 names to plain values) } of a window app');
          }
        }
        // Rule (BUGS #94): what drives a package comes with it. Its controller (a program of the package run per op, or
        // "bridge": its own program answers over ORKESTRI_BRIDGE) answers the agents' `orkestri code` ops; Orkestri
        // offers only declared primitives, `typeRun` (a window app with no API, Alacritty: `run` types the line).
        if (has('controller') && item.controller !== 'bridge' && !commandLine(item.controller)) fail('contributes.apps: controller must be "bridge" or { command, args, env }');
        if (has('typeRun') && (item.typeRun !== true || !window)) fail('contributes.apps: typeRun must be true, of a window app');
        // Rule (BUGS #102): a service runs while its extension is on, whatever cards there are.
        if (has('service') && (item.service !== true || window)) fail('contributes.apps: service must be true, of a web app');
        // Rule (BUGS #97, #98): a terminal is an Orkestri terminal (linked, listed, asked), so an ask needs a way in, its
        // controller's `write` or typed (`typeRun`), and its manual a section on Orkestri inside it.
        if (has('kind')) {
          if (item.kind !== 'terminal' || !window || (!has('controller') && item.typeRun !== true)) fail('contributes.apps: kind must be "terminal", of a window app with a controller or typeRun (how an ask reaches it)');
          // Rule (BUGS #108): it calls its connections too (an agent in it asks and answers), not only receives.
          // Rule (BUGS #116): and it draws on Orkestri's own board (`orkestri draw`).
          if (!/^## Orkestri inside it\s*$/m.test(manualText) || !['orkestri list', 'orkestri ask', 'orkestri reply', 'orkestri draw'].every((c) => manualText.includes(c))) {
            fail('contributes.apps: a terminal needs its agents manual\'s "## Orkestri inside it" section, naming orkestri list, orkestri ask, orkestri reply and orkestri draw (it calls its connections and draws on a board; how a message reaches it, whether its screen is read)');
          }
        }
        if (codeOps && !has('controller') && !has('typeRun')) fail(`contributes.apps: ${t('id')} offers its agents ops (orkestri code): it needs a controller (or only typeRun), what talks to the program comes with the package`);
        // Rule (BUGS #93): an editor opens the workspace's folder. Taking a folder is `${folder}` in `args`; an app
        // that opens folders while it runs (`openFolder`) starts on one too.
        const folder = (list) => (list ?? []).some((a) => typeof a === 'string' && a.includes('${folder}'));
        if (has('openFolder') && !(folder(item.openFolder) && folder(item.args))) fail('contributes.apps: an app with openFolder starts on ${folder} (in args, and in openFolder): it opens the workspace\'s folder');
        // Rule (BUGS #101): so does every terminal, by its args, a variable of its env, or its cwd.
        if (item.kind === 'terminal' && !folder([...(item.args ?? []), ...Object.values(item.env ?? {}), item.cwd])) fail('contributes.apps: a terminal starts on ${folder} (in args, env or cwd): it opens the workspace\'s folder');
        const timeout = item.startTimeoutMs;
        if (has('startTimeoutMs') && !(Number.isInteger(timeout) && timeout >= 0 && timeout <= 300000)) fail('contributes.apps: startTimeoutMs must be at most 300000');
      }
    }
  }
}

// An app's (or a card's) download: one file, or a list of up to 4 whose first names the version (Zed: its installer and
// the unpacker that opens it).
function downloadRule(key, item, permissions) {
  if (!('download' in item)) return;
  const list = Array.isArray(item.download) ? item.download : [item.download];
  if (!(list.length >= 1 && list.length <= 4 && list.every(validDownload))) fail(`contributes.${key}: download needs url (https, ending in a file name), sha256 (64 lower-case hex digits), size and version, or a list of up to 4 of them`);
  if (!permissions.includes('network')) fail('a download needs the permission "network"');
}

// A command line of the manifest: `{ command, args, env }` (a setup step, a controller).
function commandLine(c) {
  return isObject(c) && Object.keys(c).every((k) => ['command', 'args', 'env'].includes(k)) && typeof c.command === 'string' && c.command.trim() && bytes(c.command) <= 2000
    && (!('args' in c) || (Array.isArray(c.args) && c.args.every((a) => typeof a === 'string'))) && (!('env' in c) || (isObject(c.env) && Object.values(c.env).every((v) => typeof v === 'string')));
}

// Commands run once when it is installed, after its download.
function setupRule(key, item) {
  if ('setup' in item && !(Array.isArray(item.setup) && item.setup.every(commandLine))) fail(`contributes.${key}: setup must be a list of { command, args, env }`);
}

// The extension's `icon`, required: a Lucide glyph name as is, or a PNG or SVG file of the package as the data: address
// the index carries. The app accepts a package without it (made before the rule); the registry does not.
function iconOf(m, files) {
  if (typeof m.icon !== 'string') fail('icon is required: a Lucide glyph name, or a PNG or SVG file of the package');
  if (word(m.icon)) return m.icon;
  const file = inside(m.icon);
  const data = files.get(file) ?? fail(`icon: ${file} is missing`);
  const svg = /\.svg$/i.test(file);
  const kind = svg ? utf8(data) && data.toString('utf8').includes('<svg') : /\.png$/i.test(file) && data.subarray(0, 8).equals(PNG);
  if (!kind || data.length > MAX_MANIFEST_ICON) fail('icon must be a glyph name, or a PNG or SVG file of the package up to 64 KB');
  return `data:image/${svg ? 'svg+xml' : 'png'};base64,${data.toString('base64')}`;
}

// A file of an app's `download`: pinned (https, sha256, size), a plain file name at the end of its address, its version a
// folder name.
// `+` and `%` too (python-build-standalone's `cpython-3.12.16%2B20261110-…`): kept as written, never decoded; no `..`
// and no dot at the end, which Windows drops.
const fileName = (url) => {
  const name = url.split(/[?#]/)[0].split('/').pop();
  return /^[A-Za-z0-9._+%-]{1,100}$/.test(name) && !name.startsWith('.') && !name.endsWith('.') && !name.includes('..') ? name : null;
};
const validDownload = (d) => isObject(d) && typeof d.url === 'string' && d.url.startsWith('https://') && d.url.length <= 2000 && fileName(d.url) !== null
  && typeof d.sha256 === 'string' && /^[0-9a-f]{64}$/.test(d.sha256) && Number.isInteger(d.size) && d.size > 0
  && typeof d.version === 'string' && /^[A-Za-z0-9.-]{1,40}$/.test(d.version) && !d.version.startsWith('.')
  // `strip` drops that many leading folders of an archive (WezTerm's zip wraps everything in one folder).
  && (!('strip' in d) || (Number.isInteger(d.strip) && d.strip >= 0 && d.strip <= 3));

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
  contents(m, files);
  return { manifest: m, release: r, icon: iconOf(m, files) };
}

// What a person must look at before a merge: new permissions, network, new programs, servers beyond 127.0.0.1.
function surprises(old, m) {
  const out = [];
  const before = old?.permissions ?? [];
  for (const p of m.permissions ?? []) if (!before.includes(p)) out.push(`asks for a new permission: ${p}`);
  if ((m.permissions ?? []).includes('network')) out.push('can reach the internet (network)');
  const run = (a) => JSON.stringify([a.command, a.args ?? [], a.env ?? {}, a.openFolder ?? [], a.setup ?? [], a.controller ?? null, a.typeRun ?? false]);
  const apps = new Map((old?.contributes?.apps ?? []).map((a) => [a.id, a]));
  for (const a of m.contributes?.apps ?? []) {
    const was = apps.get(a.id);
    if (!was || run(was) !== run(a)) out.push(`app ${a.id} runs a new command: ${[a.command, ...(a.args ?? [])].join(' ')}`);
    if (a.download && JSON.stringify(was?.download) !== JSON.stringify(a.download)) {
      for (const d of [a.download].flat()) out.push(`app ${a.id} downloads a program: ${d.url} (sha256 ${d.sha256})`);
    }
    if (!local(a.args ?? [])) out.push(`app ${a.id} may serve on more than 127.0.0.1`);
    if (a.runtime && JSON.stringify(was?.runtime) !== JSON.stringify(a.runtime)) out.push(`app ${a.id} may run on the computer's own ${a.runtime.files?.[0]} (${a.runtime.version}…) instead of its download`);
    if (a.installed && JSON.stringify(was?.installed) !== JSON.stringify(a.installed)) out.push(`app ${a.id} may run the computer's own install in ${a.installed.join(', ')} instead of its download`);
  }
  // What an unlocked card runs on: its download and its setup, read as an app's are.
  const cards = new Map((old?.contributes?.cards ?? []).map((c) => [c.id, c]));
  for (const c of m.contributes?.cards ?? []) {
    const was = cards.get(c.id);
    if (!was || JSON.stringify(was.setup ?? []) !== JSON.stringify(c.setup ?? [])) for (const st of c.setup ?? []) out.push(`card ${c.id} (${c.kind}) runs a new command: ${[st.command, ...(st.args ?? [])].join(' ')}`);
    if (c.controller && JSON.stringify(was?.controller) !== JSON.stringify(c.controller)) out.push(`card ${c.id} (${c.kind}) runs a new controller: ${[c.controller.command, ...(c.controller.args ?? [])].join(' ')}`);
    if (c.download && JSON.stringify(was?.download) !== JSON.stringify(c.download)) {
      for (const d of [c.download].flat()) out.push(`card ${c.id} (${c.kind}) downloads a program: ${d.url} (sha256 ${d.sha256})`);
    }
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

// `exts`: what checkAll answered (each extension's icon comes out of its package).
function indexText(pubs, exts) {
  const extensions = ls('extensions').map((id) => {
    const m = parse(fs.readFileSync(path.join('extensions', id, MANIFEST)), MANIFEST);
    const r = parse(fs.readFileSync(path.join('extensions', id, 'release.json')), 'release.json');
    return { id: m.id, name: m.name, version: m.version, publisher: m.publisher, author: m.author, authorUrl: m.authorUrl, description: m.description ?? '', kinds: m.kinds,
      permissions: m.permissions ?? [], package: r.package, size: r.size, sha256: r.sha256, signature: r.signature, icon: exts[id]?.icon };
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
    if (!fs.existsSync('index.json') || fs.readFileSync('index.json', 'utf8') !== indexText(pubs, exts)) errors.push('index.json is not the index of this registry: a maintainer runs `node tools/registry.mjs index <key>`');
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
  const { pubs, exts } = await checkAll(packages, errors);
  if (errors.length) fail(`the registry has problems, nothing written:\n${errors.join('\n')}`);
  const text = Buffer.from(indexText(pubs, exts));
  fs.writeFileSync('index.json', text);
  fs.writeFileSync('index.json.sig', crypto.sign(null, text, key).toString('base64') + '\n');
  console.log(`index.json: ${JSON.parse(text).extensions.length} extension(s), signed`);
}

export { contents, iconOf, validate, unzip, surprises };

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
