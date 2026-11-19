// node --test tools/registry.test.mjs: the rules of registry.mjs on hand-made cases.
import assert from 'node:assert/strict';
import test from 'node:test';
import { surprises, unzip, validate } from './registry.mjs';

const theme = { id: 'orkestri.sepia', name: 'Sépia', version: '1.0.0', publisher: 'orkestri', kinds: ['contributions'],
  contributes: { themes: [{ id: 'sepia', label: 'Sépia', base: 'light', colors: { background: '#f4ecd8', accent: '#a0522d' } }],
    terminalPresets: [{ id: 'py', name: 'Python', command: 'python' }], prompts: [{ name: 'Review', file: 'prompts/review.md' }] } };
const app = { id: 'orkestri.files', name: 'Files', version: '0.1.0', publisher: 'orkestri', kinds: ['app'], permissions: ['process', 'localhost'],
  contributes: { apps: [{ id: 'server', name: 'Server', command: 'python', args: ['-m', 'http.server', '${port}', '--bind', '127.0.0.1'], port: 'auto', health: '/' }] } };
const files = new Map([['prompts/review.md', Buffer.from('Review the diff.')]]);

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
  refuses({ contributes: { apps: [{ id: 's', name: 'S', command: 'x', port: 80 }] } }, 'port', app);
});

const sha = 'a'.repeat(64);
const editor = { id: 'vscodium', name: 'VSCodium', icon: 'code', window: true, command: '${appPath}/VSCodium.exe', defaults: 'defaults', openFolder: ['--reuse-window', '${folder}'],
  download: { url: 'https://github.com/VSCodium/vscodium/releases/download/1/v.zip', sha256: sha, size: 10, version: '1.143.17232' } };
const window = { id: 'orkestri.vscodium', name: 'VSCodium', version: '1.0.0', publisher: 'orkestri', kinds: ['app'], permissions: ['process', 'network', 'files'],
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
