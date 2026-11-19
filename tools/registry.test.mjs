// node --test tools/registry.test.mjs: the rules of registry.mjs on hand-made cases.
import assert from 'node:assert/strict';
import test from 'node:test';
import { iconOf, surprises, unzip, validate } from './registry.mjs';

const theme = { id: 'orkestri.sepia', name: 'Sépia', version: '1.0.0', publisher: 'orkestri', kinds: ['contributions'], icon: 'icon.png', agents: false,
  contributes: { themes: [{ id: 'sepia', label: 'Sépia', base: 'light', colors: { background: '#f4ecd8', accent: '#a0522d' } }],
    terminalPresets: [{ id: 'py', name: 'Python', command: 'python' }], prompts: [{ name: 'Review', file: 'prompts/review.md' }] } };
const app = { id: 'orkestri.files', name: 'Files', version: '0.1.0', publisher: 'orkestri', kinds: ['app'], permissions: ['process', 'localhost'], icon: 'folder-open', agents: false,
  contributes: { apps: [{ id: 'server', name: 'Server', icon: 'folder-open', command: 'python', args: ['-m', 'http.server', '${port}', '--bind', '127.0.0.1'], port: 'auto', health: '/' }] } };
const PNG = Buffer.from('89504e470d0a1a0a', 'hex');
const files = new Map([['prompts/review.md', Buffer.from('Review the diff.')], ['icon.png', Buffer.concat([PNG, Buffer.from('rest')])],
  ['logo.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')], ['big.png', Buffer.concat([PNG, Buffer.alloc(64 << 10)])],
  ['AGENTS.md', Buffer.from('`orkestri code "X" read`')], ['long.md', Buffer.alloc(4097, 'x')]]);

// A zip of stored (uncompressed) entries; `link` makes an entry a symbolic link.
function zip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const { name, data = Buffer.alloc(0), link = false } of entries) {
    const n = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(3 << 8, 4);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(n.length, 28);
    central.writeUInt32LE(((link ? 0o120777 : 0o100644) << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    locals.push(local, n, data);
    centrals.push(central, n);
    offset += 30 + n.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

test('manifest rules', () => {
  validate(theme, files);
  validate(app, files);
  const refuses = (patch, text, base) => assert.throws(() => validate({ ...base ?? theme, ...patch }, files), (e) => e.message.includes(text), text);
  refuses({ id: 'Sepia' }, 'invalid id');
  refuses({ publisher: 'other' }, 'publisher');
  refuses({ version: '1.0' }, 'x.y.z');
  refuses({ permissions: ['everything'] }, 'unknown permissions');
  refuses({ kinds: ['plugin'] }, 'not supported');
  refuses({ kinds: ['app'] }, 'needs the kind');
  refuses({ homepage: 'x' }, 'unknown key');
  refuses({ contributes: { themes: [{ id: 'x', label: 'X', base: 'light', colors: { font: '#fff' } }] } }, 'unknown token');
  refuses({ contributes: { themes: [{ id: 'x', label: 'X', base: 'light', colors: { fg: 'red' } }] } }, '#rgb');
  refuses({ contributes: { prompts: [{ name: 'X', file: '../secret.md' }] } }, 'inside');
  refuses({ contributes: { prompts: [{ name: 'X', file: 'C:/secret.md' }] } }, 'inside');
  refuses({ contributes: { prompts: [{ name: 'X', file: 'prompts/none.md' }] } }, 'missing');
  refuses({ contributes: { roles: [] } }, 'not supported');
  refuses({ permissions: ['process'] }, '"localhost"', app);
  refuses({ contributes: { apps: [{ id: 's', name: 'S', icon: 'x', command: 'x', port: 80 }] } }, 'port', app);
  // The icon, required here (the app also takes a package made before it): a glyph name or a PNG or SVG of the package.
  refuses({ icon: undefined }, 'icon is required');
  refuses({ icon: 'missing.png' }, 'missing');
  refuses({ icon: 'prompts/review.md' }, 'PNG or SVG');
  refuses({ icon: 'big.png' }, 'up to 64 KB');
  refuses({ icon: '../icon.png' }, 'inside');
  refuses({ contributes: { apps: [{ ...app.contributes.apps[0], icon: undefined }] } }, 'glyph name', app);
  // Whether it works with the agents, required: false, or the manual they get.
  validate({ ...theme, agents: { manual: 'AGENTS.md' } }, files);
  refuses({ agents: undefined }, 'agents is required');
  for (const agents of [true, {}, 'AGENTS.md', { manual: 'AGENTS.md', extra: 1 }]) refuses({ agents }, 'agents is required');
  refuses({ agents: { manual: 'none.md' } }, 'missing');
  refuses({ agents: { manual: '../AGENTS.md' } }, 'inside');
  refuses({ agents: { manual: 'long.md' } }, '4096');
  assert.equal(iconOf(app, files), 'folder-open');
  assert.equal(iconOf(theme, files), 'data:image/png;base64,iVBORw0KGgpyZXN0');
  assert.ok(iconOf({ icon: 'logo.svg' }, files).startsWith('data:image/svg+xml;base64,'));
});

const sha = 'a'.repeat(64);
const editor = { id: 'vscodium', name: 'VSCodium', icon: 'code', window: true, command: '${appPath}/VSCodium.exe', defaults: 'defaults', openFolder: ['--reuse-window', '${folder}'],
  download: { url: 'https://github.com/VSCodium/vscodium/releases/download/1/v.zip', sha256: sha, size: 10, version: '1.143.17232' } };
const window = { id: 'orkestri.vscodium', name: 'VSCodium', version: '1.0.0', publisher: 'orkestri', kinds: ['app'], permissions: ['process', 'network', 'files'], icon: 'code', agents: false,
  contributes: { apps: [editor] } };
const windowFiles = new Map([['defaults/user-data/User/settings.json', Buffer.from('{}')]]);

test('window apps: no server, a pinned download', () => {
  validate(window, windowFiles);
  const refuses = (patch, text, permissions = window.permissions) =>
    assert.throws(() => validate({ ...window, permissions, contributes: { apps: [{ ...editor, ...patch }] } }, windowFiles), (e) => e.message.includes(text), text);
  refuses({ window: 'yes' }, 'true or false');
  refuses({ window: false }, '"localhost"');
  refuses({}, '"network"', ['process']);
  refuses({}, '"process"', []);
  refuses({ download: { ...editor.download, url: 'http://x/v.zip' } }, 'download');
  refuses({ download: { ...editor.download, sha256: 'A'.repeat(64) } }, 'download');
  refuses({ download: { ...editor.download, version: '../1' } }, 'download');
  refuses({ download: { ...editor.download, size: 0 } }, 'download');
  refuses({ icon: 'Code!' }, 'icon');
  refuses({ defaults: '../x' }, 'inside');
  refuses({ defaults: 'missing' }, 'folder');
  refuses({ openFolder: '--reuse-window' }, 'openFolder');
  validate({ ...window, contributes: { apps: [{ ...editor, setup: [{ command: '${appPath}/VSCodium.exe', args: ['--install-extension', 'x.vsix'], env: { A: '1' } }] }] } }, windowFiles);
  refuses({ setup: [{ command: 'x', cwd: '/' }] }, 'setup');
  refuses({ setup: [{ args: ['x'] }] }, 'setup');
  // A new setup step is a new program run: a person reviews it.
  assert.ok(surprises(window, { ...window, contributes: { apps: [{ ...editor, setup: [{ command: 'x' }] }] } }).some((s) => s.startsWith('app vscodium runs a new command')));
  assert.ok(!surprises(window, window).some((s) => s.startsWith('app vscodium runs')));
});

test('packages: paths stay inside, no links', () => {
  const ok = unzip(zip([{ name: './' }, { name: './orkestri-extension.json', data: Buffer.from('{}') }, { name: './www/' }, { name: './www/a.html', data: Buffer.from('a') }]));
  assert.deepEqual([...ok.keys()], ['orkestri-extension.json', 'www/a.html']);
  for (const name of ['../x', 'a/../../x', '/etc/x', 'C:/x', 'a.txt:stream', 'a\\..\\x']) {
    assert.throws(() => unzip(zip([{ name, data: Buffer.from('x') }])), /unsafe path/, name);
  }
  assert.throws(() => unzip(zip([{ name: 'l', data: Buffer.from('/etc'), link: true }])), /link/);
  assert.throws(() => unzip(Buffer.from('not a zip at all, just text bytes')), /not a zip/);
});

test('what needs a review', () => {
  assert.deepEqual(surprises(theme, theme), []);
  assert.deepEqual(surprises(app, app), []);
  assert.deepEqual(surprises(null, app), ['asks for a new permission: process', 'asks for a new permission: localhost',
    'app server runs a new command: python -m http.server ${port} --bind 127.0.0.1']);
  const network = { ...app, permissions: [...app.permissions, 'network'] };
  assert.deepEqual(surprises(app, network), ['asks for a new permission: network', 'can reach the internet (network)']);
  const open = structuredClone(app);
  open.contributes.apps[0].args = ['-m', 'http.server', '${port}', '--bind', '0.0.0.0'];
  assert.ok(surprises(app, open).includes('app server may serve on more than 127.0.0.1'));
  open.contributes.apps[0].args = ['serve', '--host=192.168.0.2'];
  assert.ok(surprises(app, open).includes('app server may serve on more than 127.0.0.1'));
  // A window app's program: a new or changed download is read by a person.
  assert.ok(surprises(null, window).includes(`app vscodium downloads a program: ${editor.download.url} (sha256 ${sha})`));
  assert.deepEqual(surprises(window, window), ['can reach the internet (network)']);
  const moved = structuredClone(window);
  moved.contributes.apps[0].download.url = 'https://example.com/other.zip';
  assert.deepEqual(surprises(window, moved), ['can reach the internet (network)', `app vscodium downloads a program: https://example.com/other.zip (sha256 ${sha})`]);
});
