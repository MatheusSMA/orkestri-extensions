// node --test tools/registry.test.mjs: the rules of registry.mjs on hand-made cases.
import assert from 'node:assert/strict';
import test from 'node:test';
import { contents, iconOf, surprises, unzip, validate } from './registry.mjs';

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

test('a contributions package holds data files and the backdrop files its themes name', () => {
  const pkg = (extra) => new Map([['orkestri-extension.json', Buffer.from('{}')], ['README.md', Buffer.from('x')], ...extra]);
  const named = { ...theme, contributes: { themes: [{ id: 'x', label: 'X', base: 'dark', colors: {}, backdrop: { file: 'media/sea.mp4' }, terminalBackdrop: { file: 'media\\still.jpg' } }] } };
  contents(named, pkg([['media/sea.mp4', Buffer.alloc(1)], ['media/still.jpg', Buffer.alloc(1)]]));
  assert.throws(() => contents(theme, pkg([['media/sea.mp4', Buffer.alloc(1)]])), /only data files .*media\/sea\.mp4/);
  assert.throws(() => contents(named, pkg([['media/sea.mp4', Buffer.alloc(1)], ['run.exe', Buffer.alloc(1)]])), /run\.exe/);
  contents(app, pkg([['bin/server.exe', Buffer.alloc(1)]]));
});

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
  // Its author: who made the content, shown in its place; the publisher still signs.
  validate({ ...theme, author: 'Marcos Gabriel', authorUrl: 'https://marketplace.visualstudio.com/items?itemName=MarcosGabriel.lucid-volcano' }, files);
  for (const author of ['', ' ', 7, 'x'.repeat(101)]) refuses({ author }, 'author must');
  for (const authorUrl of ['http://example.com', 'example.com', 1]) refuses({ authorUrl }, 'authorUrl');
  refuses({ contributes: { themes: [{ id: 'x', label: 'X', base: 'light', colors: { font: '#fff' } }] } }, 'unknown token');
  refuses({ contributes: { themes: [{ id: 'x', label: 'X', base: 'light', colors: { fg: 'red' } }] } }, '#rgb');
  // A theme's backdrop (Orkestri BUGS #118): a template Orkestri draws, or a picture or video of the package.
  const media = new Map([...files, ['media/sea.mp4', Buffer.from('mp4')], ['media/big.webp', Buffer.alloc((20 << 20) + 1)]]);
  const themed = (b, k = 'backdrop') => ({ ...theme, contributes: { themes: [{ id: 'x', label: 'X', base: 'dark', colors: {}, [k]: b }] } });
  validate(themed({ template: 'aurora', dim: 0.4, grid: false }), media);
  validate(themed({ template: 'smoke' }), media);
  validate(themed({ template: 'fog', dim: 0.2 }, 'terminalBackdrop'), media);
  // Orkestri BUGS #132: the introduction's still lights.
  validate(themed({ template: 'glow', dim: 0 }), media);
  validate(themed({ file: 'media/sea.mp4', fit: 'contain', blur: 0 }, 'terminalBackdrop'), media);
  for (const [b, text] of [[{ template: 'sunset' }, 'unknown template'], [{ file: 'media/gone.png' }, 'is missing'], [{ file: '../x.png' }, 'inside'],
    [{ file: 'run.exe' }, 'png, jpg'], [{ file: 'media/big.webp' }, 'larger than 20 MB'], [{ template: 'rain', file: 'media/sea.mp4' }, 'not both'],
    [{ template: 'rain', dim: 2 }, 'dim'], [{ template: 'rain', fit: 'tile' }, 'fit'], [{ template: 'rain', sound: true }, 'unknown key'], ['rain', 'object']]) {
    assert.throws(() => validate(themed(b), media), (e) => e.message.includes(text), text);
  }
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
const editor = { id: 'vscodium', name: 'VSCodium', icon: 'code', window: true, command: '${appPath}/VSCodium.exe', args: ['${folder}'], defaults: 'defaults', openFolder: ['--reuse-window', '${folder}'],
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
  // Zed: a list of downloads, the zoom of a settings file, its controller; each file is reviewed.
  const file = (name) => ({ url: `https://x/${name}`, sha256: sha, size: 10, version: '1.0.0' });
  const zed = { download: [file('Zed-x86_64.exe'), file('innounp-2.zip')], zoom: { file: 'config/settings.json', sizes: { ui_font_size: 16, buffer_font_size: 15 } }, controller: { command: '${extensionPath}/controller.exe' } };
  validate({ ...window, contributes: { apps: [{ ...editor, ...zed }] } }, windowFiles);
  refuses({ download: [] }, 'download');
  refuses({ download: ['a.zip', 'b.zip', 'c.zip', 'd.zip', 'e.zip'].map(file) }, 'download');
  refuses({ download: [file('Zed.exe'), file('')] }, 'download');
  for (const zoom of [{ file: '../s.json', sizes: { a: 16 } }, { file: 'C:/s.json', sizes: { a: 16 } }, { file: 's.json', sizes: {} }, { file: 's.json', sizes: { a: 2 } }, { file: 's.json', sizes: { a: 16 }, x: 1 }]) {
    refuses({ zoom }, 'zoom');
  }
  // WezTerm: an archive unpacked without its wrapping folder; its controller with the env Orkestri fills.
  validate({ ...window, contributes: { apps: [{ ...editor, download: { ...file('w.zip'), strip: 1 }, controller: { command: '${extensionPath}/controller.exe', env: { S: '${userProfile}/s-${pid}' } } }] } }, windowFiles);
  refuses({ download: { ...file('w.zip'), strip: 4 } }, 'download');
  // BUGS #94: a controller is "bridge" or a command line; a new one is reviewed.
  validate({ ...window, contributes: { apps: [{ ...editor, controller: 'bridge' }] } }, windowFiles);
  for (const controller of ['cli', { args: ['x'] }, { command: '' }, { command: 'x', keep: true }, { command: 'x', env: { A: 1 } }]) refuses({ controller }, 'controller');
  assert.ok(surprises(window, { ...window, contributes: { apps: [{ ...editor, controller: { command: 'x' } }] } }).some((s) => s.startsWith('app vscodium runs a new command')));
  // BUGS #94: a manual that offers `orkestri code` ops needs each app's controller, or only typeRun.
  const manual = new Map([...windowFiles, ['AGENTS.md', Buffer.from('`orkestri code "VSCodium" open a.rs`')]]);
  const offers = { ...window, agents: { manual: 'AGENTS.md' } };
  assert.throws(() => validate(offers, manual), /needs a controller/);
  validate({ ...offers, contributes: { apps: [{ ...editor, controller: 'bridge' }] } }, manual);
  validate({ ...offers, contributes: { apps: [{ ...editor, typeRun: true }] } }, manual);
  validate({ ...offers, contributes: { apps: [editor] } }, new Map([...windowFiles, ['AGENTS.md', Buffer.from('Ask the person to open it.')]]));
  // BUGS #97, #98: a terminal: a way in for an ask, and its manual's section on Orkestri inside it.
  const inside = new Map([...windowFiles, ['AGENTS.md', Buffer.from('# T\n\n## Orkestri inside it\n\n`orkestri list`, `orkestri ask "A" "hi"`, `orkestri reply`: typed. `orkestri draw "B" --svg b.svg`.\n')]]);
  const terminal = { ...window, agents: { manual: 'AGENTS.md' } };
  validate({ ...terminal, contributes: { apps: [{ ...editor, kind: 'terminal', typeRun: true }] } }, inside);
  validate({ ...terminal, contributes: { apps: [{ ...editor, kind: 'terminal', controller: { command: 'x' } }] } }, inside);
  for (const bad of [{ kind: 'terminal' }, { kind: 'editor', typeRun: true }]) {
    assert.throws(() => validate({ ...terminal, contributes: { apps: [{ ...editor, ...bad }] } }, inside), /kind must be "terminal"/, JSON.stringify(bad));
  }
  // BUGS #108: and it calls its connections: an agent in it answers (`orkestri reply`), not only receives.
  for (const text of ['`orkestri list`, `orkestri ask`', '## Orkestri inside it\n\n`orkestri list` only', '### Orkestri inside it\n`orkestri list` `orkestri ask`',
    '## Orkestri inside it\n\n`orkestri list`, `orkestri ask`',
    // BUGS #116: and it draws on Orkestri's board.
    '## Orkestri inside it\n\n`orkestri list`, `orkestri ask`, `orkestri reply`']) {
    assert.throws(() => validate({ ...terminal, contributes: { apps: [{ ...editor, kind: 'terminal', typeRun: true }] } }, new Map([...windowFiles, ['AGENTS.md', Buffer.from(text)]])), /Orkestri inside it/, text);
  }
  assert.throws(() => validate({ ...window, contributes: { apps: [{ ...editor, kind: 'terminal', typeRun: true }] } }, windowFiles), /Orkestri inside it/, 'agents false');
  // BUGS #101: a terminal starts on the workspace's folder too (Warp OSS 1.1.0 opened in Orkestri's): args, env or cwd.
  const shell = { ...editor, kind: 'terminal', typeRun: true, args: [] };
  delete shell.openFolder;
  for (const way of [{ args: ['--cwd', '${folder}'] }, { env: { WARP_INITIAL_WORKING_DIR: '${folder}' } }, { cwd: '${folder}' }]) {
    validate({ ...terminal, contributes: { apps: [{ ...shell, ...way }] } }, inside);
  }
  assert.throws(() => validate({ ...terminal, contributes: { apps: [{ ...shell, env: { WARP_DATA_ROOT: '${instancePath}' } }] } }, inside), /a terminal starts on \$\{folder\}/);
  // BUGS #93: an app that opens folders starts on the workspace's folder.
  refuses({ args: [] }, 'starts on ${folder}');
  refuses({ openFolder: ['--reuse-window'] }, 'starts on ${folder}');
  // Alacritty: `run` typed into its window, its font size a `section.key` of a TOML file.
  validate({ ...window, contributes: { apps: [{ ...editor, typeRun: true, zoom: { file: 'orkestri.toml', sizes: { 'font.size': 11 } } }] } }, windowFiles);
  for (const typeRun of ['yes', false]) refuses({ typeRun }, 'typeRun');
  refuses({ zoom: { file: 'o.toml', sizes: { 'font..size': 11 } } }, 'zoom');
  // BUGS #104: Warp: its whole UI zoomed by a percent key.
  validate({ ...window, contributes: { apps: [{ ...editor, zoom: { file: 'warp/config/settings.toml', percent: 'appearance.window.zoom_level' } }] } }, windowFiles);
  for (const zoom of [{ file: 's.toml' }, { file: 's.toml', percent: 'a..b' }, { file: 's.toml', percent: 100 }]) refuses({ zoom }, 'zoom');
  assert.deepEqual(surprises(null, { ...window, contributes: { apps: [{ ...editor, ...zed }] } }).filter((s) => s.includes('downloads')),
    ['app vscodium downloads a program: https://x/Zed-x86_64.exe (sha256 ' + sha + ')', 'app vscodium downloads a program: https://x/innounp-2.zip (sha256 ' + sha + ')']);
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

test('web apps: a runtime of the computer or its download (n8n on Node.js)', () => {
  const node = { url: 'https://nodejs.org/dist/v24.22.3/node.zip', sha256: 'b'.repeat(64), size: 10, version: '24.22.3' };
  const runtime = { files: ['node.exe', 'node_modules/npm/bin/npm-cli.js'], version: 'v24.' };
  const n8n = { ...app, permissions: ['process', 'localhost', 'network'], contributes: { apps: [{ ...app.contributes.apps[0], command: '${appPath}/node.exe', download: node, runtime }] } };
  validate(n8n, files);
  const refuses = (patch) => assert.throws(() => validate({ ...n8n, contributes: { apps: [{ ...n8n.contributes.apps[0], ...patch }] } }, files), /runtime/, JSON.stringify(patch));
  for (const bad of [{ files: [], version: 'v24.' }, { files: ['../node.exe'], version: 'v24.' }, { files: ['C:/node.exe'], version: 'v24.' }, { files: ['node.exe'] },
    { files: ['node.exe'], version: '' }, { files: ['node.exe'], version: 'v24.', x: 1 }, 'node']) refuses({ runtime: bad });
  const { download, ...alone } = n8n.contributes.apps[0];
  assert.throws(() => validate({ ...n8n, contributes: { apps: [alone] } }, files), /runtime/, 'a runtime needs a download to fall back on');
  assert.ok(surprises(null, n8n).includes("app server may run on the computer's own node.exe (v24.…) instead of its download"));
  assert.ok(!surprises(n8n, n8n).some((s) => s.includes('runtime') || s.includes('own node.exe')));
});

test('services and item cards: n8n kept on, a card per workflow (BUGS #102)', () => {
  const server = { ...app.contributes.apps[0], controller: 'bridge', service: true };
  const flow = { id: 'workflow', name: 'Workflow', icon: 'zap', item: 'server' };
  const with_ = (apps) => ({ ...app, contributes: { apps } });
  validate(with_([server, flow]), files);
  assert.throws(() => validate(with_([{ ...server, service: 'yes' }, flow]), files), /service must be/);
  assert.throws(() => validate(with_([{ ...server, window: true, service: true }]), files), /service must be|permission|window/);
  const { service, ...plain } = server;
  assert.throws(() => validate(with_([plain, flow]), files), /item names a service/);
  for (const bad of [{ item: 'nope' }, { command: 'x' }, { icon: 'Zap!' }]) assert.throws(() => validate(with_([server, { ...flow, ...bad }]), files), /item|icon/, JSON.stringify(bad));
  // BUGS #110: the blocks of a service (n8n's nodes) name it, nothing else.
  const blocks = (card) => ({ ...app, contributes: { apps: [server], cards: [card] } });
  validate(blocks({ id: 'block', kind: 'serviceBlock', service: 'server' }), files);
  for (const bad of [{ service: 'nope' }, { controller: { command: 'x' } }]) assert.throws(() => validate(blocks({ id: 'block', kind: 'serviceBlock', service: 'server', ...bad }), files), /serviceBlock/, JSON.stringify(bad));
});

test('cards: an extension unlocks a built-in card and brings what it runs on (Jupyter)', () => {
  const python = { url: 'https://github.com/x/y/releases/download/1/cpython-3.12.16%2B20261110-install_only_stripped.tar.gz', sha256: 'c'.repeat(64), size: 10, version: '3.12.16', strip: 1 };
  const setup = [{ command: '${appPath}/python.exe', args: ['-m', 'pip', 'install', 'ipykernel==7.4.0'], env: { PIP_NO_CACHE_DIR: '1' } }];
  const controller = { command: '${appPath}/python.exe', args: ['-I', '${extensionPath}/kernel.py'] };
  const jupyter = { ...app, permissions: ['process', 'localhost', 'network'], contributes: { cards: [{ id: 'python', kind: 'notebookCell', download: python, setup, controller }] } };
  validate(jupyter, files);
  const card = (patch) => ({ ...jupyter, contributes: { cards: [{ ...jupyter.contributes.cards[0], ...patch }] } });
  assert.throws(() => validate(card({ kind: 'terminal' }), files), /kind must be one of/);
  assert.throws(() => validate(card({ command: 'x' }), files), /\{ id, kind, download, setup, controller \}/);
  // BUGS #94: what the card talks to is the package's.
  assert.throws(() => validate(card({ controller: undefined }), files), /controller must be/);
  assert.throws(() => validate(card({ controller: 'bridge' }), files), /controller must be/);
  assert.throws(() => validate(card({ setup: [{ args: ['x'] }] }), files), /contributes\.cards: setup/);
  assert.throws(() => validate(card({ download: { ...python, url: 'https://x/a..b.zip' } }), files), /contributes\.cards: download/);
  assert.throws(() => validate({ ...jupyter, kinds: ['contributions'] }, files), /needs the kind "app"/);
  assert.throws(() => validate({ ...jupyter, permissions: ['network'] }, files), /"process"/);
  assert.throws(() => validate({ ...jupyter, permissions: ['process'] }, files), /"network"/);
  assert.ok(surprises(null, jupyter).includes(`card python (notebookCell) downloads a program: ${python.url} (sha256 ${python.sha256})`));
  assert.ok(surprises(null, jupyter).includes('card python (notebookCell) runs a new command: ${appPath}/python.exe -m pip install ipykernel==7.4.0'));
  assert.ok(surprises(null, jupyter).includes('card python (notebookCell) runs a new controller: ${appPath}/python.exe -I ${extensionPath}/kernel.py'));
  assert.deepEqual(surprises(jupyter, jupyter), ['can reach the internet (network)']);
  // Or a folder of the package holding what it runs on (its Python, shipped inside).
  const inside = { ...jupyter, contributes: { cards: [{ id: 'python', kind: 'notebookCell', path: 'python', controller }] } };
  validate(inside, new Map([...files, ['python/python.exe', Buffer.from('MZ')]]));
  assert.throws(() => validate(inside, files), /path must be a folder of the package/);
  assert.throws(() => validate({ ...inside, contributes: { cards: [{ id: 'python', kind: 'notebookCell', path: '../python', controller }] } }, files), /inside|outside|path/);
  assert.throws(() => validate({ ...inside, contributes: { cards: [{ id: 'python', kind: 'notebookCell', path: 'python', download: python, controller }] } }, new Map([...files, ['python/python.exe', Buffer.from('MZ')]])), /instead of/);
});
