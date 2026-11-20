# Orkestri extensions

The registry of Orkestri extensions: themes, terminal presets, prompts and apps. Orkestri reads `index.json` from this
repository (Loja › Disponíveis, the store), checks its signature, and installs a package only when its size, sha256 and its
publisher's signature match the index.

| Extension | What it adds |
| --- | --- |
| [`orkestri.sepia`](extensions/orkestri.sepia) | A warm paper theme |
| [`orkestri.lucid-volcano`](extensions/orkestri.lucid-volcano) | Two dark themes, Lava and Magma, with a pink-red accent: the palette of [Lucid Volcano](https://marketplace.visualstudio.com/items?itemName=MarcosGabriel.lucid-volcano) by Marcos Gabriel (its colours only; the original states no licence) |
| [`orkestri.vscodium`](extensions/orkestri.vscodium) | VSCodium (MIT) inside a card as its own window, no server; the portable build is downloaded on first start and checked against its pinned sha256 |
| [`orkestri.zed`](extensions/orkestri.zed) | Zed (open source) inside a card as its own window, one per card; the official build is downloaded when installed and checked against its pinned sha256 |
| [`orkestri.wezterm`](extensions/orkestri.wezterm) | WezTerm (MIT) inside a card as its own window, one per card, its text following the canvas zoom; linked terminals run command lines in it and read its screen |
| [`orkestri.alacritty`](extensions/orkestri.alacritty) | Alacritty (Apache-2.0 or MIT) inside a card as its own window, one per card, its text following the canvas zoom; linked terminals type command lines into it |
| [`orkestri.files`](extensions/orkestri.files) | A sample app: a local static page served by Python in a card |
| [`orkestri.n8n`](extensions/orkestri.n8n) | [n8n](https://n8n.io) (fair-code, Sustainable Use License) on this computer only, its editor in a card; linked terminals list, create and run workflows. Uses the computer's Node.js 24 or the official portable one, then installs n8n from npm into Orkestri's profile. Not made or endorsed by n8n GmbH |

## Layout

```
index.json, index.json.sig     what the app reads; written and signed by the maintainers (never by a pull request)
publishers/<name>.json         { "key": "<ed25519 public key, base64>", "github": "<GitHub login>" }
extensions/<id>/               orkestri-extension.json, README.md, icon.png, release.json (+ CHANGELOG.md)
tools/registry.mjs             the checker CI runs, and the commands below (Node 20 or later, no dependencies)
```

`release.json` says where the package is and pins it:

```json
{ "version": "1.0.0", "package": "https://github.com/<you>/<repo>/releases/download/<tag>/<id>-<version>.zip",
  "size": 5841, "sha256": "<hex>", "signature": "<ed25519 signature of the zip's bytes, base64>" }
```

## Adding an extension

1. **A key, once.** `node tools/registry.mjs keygen <file>` writes your private key to `<file>` and prints the public
   half. Keep the file outside every repository and back it up: every version you publish is signed with it.
2. **Register as a publisher** (first pull request only): add `publishers/<name>.json` with that public key and your
   GitHub login. `<name>` is the first part of your extension ids (`<name>.<extension>`).
3. **Package it.** A zip with `orkestri-extension.json`, `README.md` and `icon.png` (PNG, 128×128) at its root, plus
   the files it names. On Windows: `tar -a -cf <id>-<version>.zip -C <folder> .`; elsewhere:
   `cd <folder> && zip -r ../<id>-<version>.zip .`
4. **Host the zip** at a stable https address: a release asset of a public repository of yours is ideal. Never replace
   a published file: its sha256 is pinned, a new version is a new file.
5. **Fill its folder:** `node tools/registry.mjs add <zip> <private key file> <https address>` checks the package,
   signs it and writes `extensions/<id>/` (manifest, README, icon, release.json).
6. **Check, then open the pull request:** `node tools/registry.mjs check --packages <folder holding the zip>`. One
   extension per pull request; a new version updates the extension's folder and raises its `version`.

## Manifest rules

The app enforces these at install, and CI enforces the same ones (plus the registry's own) on every pull request. An
unknown key, kind, permission, contribution or colour token is refused, not ignored.

```json
{
  "id": "orkestri.sepia",
  "name": "Orkestri Sépia",
  "version": "1.0.0",
  "publisher": "orkestri",
  "description": "A warm paper theme.",
  "minAppVersion": "0.1.0",
  "kinds": ["contributions"],
  "permissions": [],
  "icon": "icon.png",
  "agents": false,
  "contributes": { "themes": [{ "id": "sepia", "label": "Sépia", "base": "light", "colors": { "accent": "#a0522d" } }] }
}
```

- `id`: `publisher.name`, each part lower-case letters, digits and dashes (at most 40, not starting with a dash);
  `publisher` is its first part, a registered publisher. The folder is named after the id.
- `name`: 1 to 100 characters; `description`: up to 500; `version` and `minAppVersion`: `x.y.z`.
- `icon` (required): a PNG or SVG file of the package up to 64 KB (`icon.png`, 128×128, is the usual one), or the
  name of a Lucide glyph Orkestri knows (`palette`, `code`, `globe`...). The store shows it beside the name and the
  author; the index carries it (a file as a `data:` address, so the index's signature covers it).
- `agents` (required): whether the agents in Orkestri's terminals can use the extension. `false` when it is for the
  person only (a theme, a preset); `{ "manual": "AGENTS.md" }` when agents can use it: a UTF-8 file of the package, at
  most 4 KB, their manual. Write it for an agent: what it can do with the extension and how it reaches it (how it shows
  in `orkestri list`, each command with one short example, what it answers). Orkestri adds the manual of every
  installed, enabled extension to the skill its agents read, so keep it short.
- `kinds`: `contributions` (data only, no code runs) and/or `app` (a local program shown in a card). `plugin` is not
  supported yet.
- `contributes`:

| Key | Kind | Fields |
| --- | --- | --- |
| `themes` | contributions | `id`, `label`, `base` (`light` or `dark`), `colors`: tokens over the base, each `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa` |
| `terminalPresets` | contributions | `id`, `name`, `command`, optional `icon` |
| `prompts` | contributions | `name`, optional `description`, `file` (a UTF-8 file inside the package, up to 256 KB) |
| `apps` | app | `id`, `name`, `command`, `args`, optional `env`, `cwd`, `port` (`"auto"` or 1024–65535), `health` and `path` (start with `/`), `startTimeoutMs` (at most 300000), `icon` (required: the Lucide glyph of its row in the canvas's Adicionar menu and of its card), `setup`, `download`, `runtime` (below); for a window app also `window`, `defaults`, `openFolder` (below) |
| `cards` | app | `id`, `kind` (a card Orkestri draws itself that the extension unlocks: `notebookCell`), optional `download` and `setup` (what that card runs on, below) |

Theme tokens: `background`, `canvas_bg`, `grid_line`, `bg`, `bg_elevated`, `bg_hover`, `bg_active`, `fg`, `fg_muted`,
`fg_subtle`, `border`, `border_strong`, `accent`, `accent_soft`, `destructive`, `warning`, `success`, `sidebar_bg`,
`sidebar_fg`, `sidebar_hover`, `sidebar_active`, `sidebar_border`, `rope`, `terminal_paper`, `note_paper`, `note_ink`,
`glass_rgb`, `glass_highlight`, `icon`, `icon_soft`, `icon_softer`, `paper`.

An app's `command`, `args`, `env` and `cwd` may use `${port}` (a free port of 127.0.0.1), `${token}` (a secret kept
between starts), `${extensionPath}` and `${dataPath}` (the extension's own data folder). The program runs with no
console window and ends with the extension or with Orkestri; it is ready when its `health` path answers on its port.

`setup`: a list of `{ "command", "args", "env" }` run in order, with no console window, as soon as the extension is
installed or enabled (after its `download`), each required to succeed (`${extensionPath}`, `${dataPath}`, `${appPath}`).
They run again only when they, the program or the extension's version change. Use it for what the program needs once
(VSCodium installs its bridge extension with its own command line, headless; n8n installs itself with npm into
`${dataPath}`, never globally). A web app may have a `download` and `setup` too, and `${appPath}` then reaches its
`command`, `args` and `env`.

`runtime` (Orkestri 0.1.5): an interpreter the computer may already have, so the `download` is fetched only when it
has none. `files` (1 to 4 relative paths) are what its folder holds, the first its program; `version` is the start of
what `<program> --version` answers. A folder on PATH that holds them and answers that version is `${appPath}`;
otherwise `${appPath}` is the download's folder, or the one folder in it holding the files.

```json
"download": { "url": "https://nodejs.org/dist/v24.22.3/node-v24.22.3-win-x64.zip", "sha256": "…", "size": 37762649, "version": "24.22.3" },
"runtime": { "files": ["node.exe", "node_modules/npm/bin/npm-cli.js"], "version": "v24." },
"setup": [{ "command": "${appPath}/node.exe", "args": ["${extensionPath}/launch.js", "install", "${dataPath}", "n8n@2.48.6"] }],
"command": "${appPath}/node.exe", "args": ["${extensionPath}/launch.js", "serve", "${port}", "${token}", "${dataPath}"]
```

`cards` (Orkestri 0.1.6): some cards are Orkestri's own code (an extension cannot draw them) yet exist only for whoever
installs the extension that unlocks them. While no installed, enabled extension names its `kind`, that card is not in
the Adicionar menus, a card of it already on a canvas says the extension is off, and the agents' commands for it
refuse. Its `download` and `setup` are prepared as an app's when the extension is installed or enabled, and Orkestri
hands the folder (`${appPath}`) to the card. `orkestri.jupyter` unlocks the notebook cells and brings a portable
Python with ipykernel:

```json
"contributes": { "cards": [{ "id": "jupyter-python", "kind": "notebookCell",
  "download": { "url": "https://github.com/astral-sh/python-build-standalone/releases/download/20261110/cpython-3.12.16%2B20261110-x86_64-pc-windows-msvc-install_only_stripped.tar.gz", "sha256": "…", "size": 22365213, "version": "3.12.16", "strip": 1 },
  "setup": [{ "command": "${appPath}/python.exe", "args": ["-m", "pip", "install", "--no-warn-script-location", "ipykernel==7.4.0"], "env": { "PYTHONNOUSERSITE": "1", "PIP_NO_CACHE_DIR": "1" } }] }] }
```

A download's file name may hold `+` and `%` (kept as written, never decoded; no `..`, no dot at its end).

A web app runs while a card of it exists (it starts when one is opened or is there when Orkestri starts, and stops
with its last card). Make its `health` answer at once with a page that waits for the real server, as
`orkestri.n8n/launch.js` does. Every app is started with `ORKESTRI_BRIDGE=<port>:<token>`: a program that connects to
`127.0.0.1:<port>`, sends `{"token":"<token>"}` and a newline, then answers one JSON line per request
(`{ "id", "op", "args" }` → `{ "id", "ok": true, "text" }` or `{ "id", "ok": false, "error" }`) is what a linked
terminal's `orkestri code "<card>" <op>` reaches; say which ops in the `agents` manual.

**Window apps** (`"window": true`) show the program's own window in a card instead of a web page: no port, no server,
and they need only `process`. Orkestri catches the window as it is created, strips its frame and keeps it over the
card. Their extra keys:

- `download`: `{ "url": "https://…", "sha256": "<64 lower-case hex>", "size": <bytes>, "version": "<folder name>" }`,
  the program's archive (zip), fetched when the extension is installed, checked against its size and sha256 and unpacked into the
  profile's `apps\<app id>\<version>`; `${appPath}` is that folder. Needs `network`. The package itself never carries
  the program.
- `defaults`: a folder of the package whose files are copied into `${instancePath}` when they are not there yet (first
  settings; a person's own changes stay). Each card runs its own program, started with its own folder
  `${instancePath}` (`${dataPath}\instances\<card>`): point the program's data there to keep two cards apart.
- `openFolder`: the arguments that open a folder in the running program (`${folder}`: the workspace's working folder),
  run as a second start of `command`; the card's "Abrir pasta".
- `strip` in a `download` (0 to 3): leading folders of the archive dropped as it is unpacked (WezTerm's zip wraps
  everything in one folder).
- `zoom` (Orkestri 0.1.3): `{ "file": "<relative path in ${instancePath}>", "sizes": { "<key>": <size at zoom 1> } }`,
  a file the program reloads by itself where Orkestri writes the font sizes as the canvas zooms; a `.toml` file holds
  only the sizes, `"font.size"` under `[font]` (Alacritty imports it).
- `cli` (Orkestri 0.1.4): agents through the program's own command line: `{ "command", "env", "run", "read" }`, with
  `${appPath}`, `${pid}` (the card's program), `${userProfile}` (the person's profile folder) and `${text}` (the line
  `run` sends):

  ```json
  "cli": { "command": "${appPath}/wezterm.exe",
           "env": { "WEZTERM_UNIX_SOCKET": "${userProfile}/.local/share/wezterm/gui-sock-${pid}" },
           "run": ["cli", "--no-auto-start", "send-text", "--no-paste", "${text}"],
           "read": ["cli", "--no-auto-start", "get-text"] }
  ```
- `typeRun: true` (Orkestri 0.1.4): a program with no API (Alacritty on Windows): `run` types the line and Enter into
  its window.

Packages: at most 50 MB zipped and 200 MB unpacked; no links, no absolute paths or `..`; a `contributions` package
holds only data files (`.json`, `.md`, `.png`, `.svg`, `.txt`).

## Permissions and review

| Permission | What the person is told it can do |
| --- | --- |
| `process` | run programs on this computer |
| `localhost` | open a local server (127.0.0.1) |
| `network` | reach the internet |
| `files` | read and write files outside its folder |

An app needs `process` and `localhost`. Orkestri asks the person before installing anything that requests a
permission. A permission is a consent, not a sandbox: an app runs with the person's rights, so every one is read by a
maintainer. CI marks a pull request for review, and fails it until a maintainer adds the label `permissions-reviewed`,
when it:

- asks for a permission the previous version did not have, or for `network` at all;
- adds or changes an app's command, arguments, environment or `setup`, or the program its `download` fetches, or a
  card's `setup` or `download`;
- may serve on anything but 127.0.0.1 (`0.0.0.0`, `::`, another host after `--host`, `--bind` and the like);
- changes a publisher's key or GitHub account, removes something, or touches files outside `extensions/` and
  `publishers/`.

Reviewing an app, a maintainer also checks that its program never takes the foreground by itself, makes itself
topmost, hooks the mouse or keyboard globally, or opens windows outside its card (see Contributing: the mouse only
after a click).

## Signing

Two signatures, both ed25519 over exact bytes:

- **The publisher signs the package.** `release.json` carries the signature of the zip; the index carries the
  publisher's public key. The registry cannot change a package without the publisher's key.
- **The registry signs the index.** `index.json.sig` is the signature of `index.json`'s bytes by the registry key,
  whose public half is built into Orkestri (and into `tools/registry.mjs`). The app refuses this registry's index when
  the signature does not verify, so the publishers' keys and the hashes in it are vouched for.

## What CI checks

`tools/registry.mjs check`, on every pull request (run from the base branch, so a pull request cannot change the rules
it is checked by) and on every push:

- each publisher file: the key is a 32-byte ed25519 public key, the login a GitHub login;
- each extension: the manifest rules above (its `icon`, each app's `icon` and `agents` included), the folder named after the id,
  `icon.png` a PNG up to 256 KB,
  `release.json` complete and its version the manifest's; the package downloaded, its size and sha256 as pinned, its
  signature verified with the publisher's key; the zip's paths, links and sizes; the manifest in the zip byte for byte
  the one in the folder;
- on a pull request: its author is the publisher's GitHub account; a changed extension's version is newer than the
  last; `index.json` is left alone; the review points above;
- on `main`: `index.json` is exactly the index of the folders, and its signature verifies.

The checker is a small standalone script that mirrors the rules Orkestri applies at install; Orkestri checks every
package again when it installs it.

## Contributing

- Open one pull request per extension (or per publisher registration plus its first extension). Use the account
  named in your publisher file: CI refuses changes to an extension from any other account.
- Keep packages small and self-contained: no telemetry, nothing downloaded at install, no personal data, no machine
  paths. An app that downloads something on its first start says so in its description.
- **The mouse only after a click.** Whatever a package shows in a card gets no mouse input until the person selects
  that card; Orkestri enforces it, a package cannot opt out. Its program must not take the foreground by itself, make
  itself topmost, hook the mouse or keyboard globally, or open windows outside its card. A package that does is taken
  out of the registry.
- A new version: a new zip at a new address, then `node tools/registry.mjs add` again; describe what changed in the
  pull request (and in `CHANGELOG.md` if you keep one).
- Reporting a problem with an extension (it misbehaves, asks for more than it needs): open an issue naming its id and
  version.

Maintainers, after merging: `node tools/registry.mjs index <registry key file>` checks the whole registry, writes
`index.json` and signs it into `index.json.sig`; commit both to `main`.
