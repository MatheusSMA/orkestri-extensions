# Orkestri extensions

The registry of Orkestri extensions: themes, terminal presets, prompts and apps. Orkestri reads `index.json` from this
repository (Extensões › Disponíveis), checks its signature, and installs a package only when its size, sha256 and its
publisher's signature match the index.

| Extension | What it adds |
| --- | --- |
| [`orkestri.sepia`](extensions/orkestri.sepia) | A warm paper theme |
| [`orkestri.python-kit`](extensions/orkestri.python-kit) | A Python terminal preset and a prompt that explains an error |
| [`orkestri.vscode-web`](extensions/orkestri.vscode-web) | VS Code (or VSCodium) in a card, through `code serve-web` |
| [`orkestri.files`](extensions/orkestri.files) | A sample app: a local static page served by Python in a card |

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
  "contributes": { "themes": [{ "id": "sepia", "label": "Sépia", "base": "light", "colors": { "accent": "#a0522d" } }] }
}
```

- `id`: `publisher.name`, each part lower-case letters, digits and dashes (at most 40, not starting with a dash);
  `publisher` is its first part, a registered publisher. The folder is named after the id.
- `name`: 1 to 100 characters; `description`: up to 500; `version` and `minAppVersion`: `x.y.z`.
- `kinds`: `contributions` (data only, no code runs) and/or `app` (a local program shown in a card). `plugin` is not
  supported yet.
- `contributes`:

| Key | Kind | Fields |
| --- | --- | --- |
| `themes` | contributions | `id`, `label`, `base` (`light` or `dark`), `colors`: tokens over the base, each `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa` |
| `terminalPresets` | contributions | `id`, `name`, `command`, optional `icon` |
| `prompts` | contributions | `name`, optional `description`, `file` (a UTF-8 file inside the package, up to 256 KB) |
| `apps` | app | `id`, `name`, `command`, `args`, optional `env`, `cwd`, `port` (`"auto"` or 1024–65535), `health` and `path` (start with `/`), `startTimeoutMs` (at most 300000) |

Theme tokens: `background`, `canvas_bg`, `grid_line`, `bg`, `bg_elevated`, `bg_hover`, `bg_active`, `fg`, `fg_muted`,
`fg_subtle`, `border`, `border_strong`, `accent`, `accent_soft`, `destructive`, `warning`, `success`, `sidebar_bg`,
`sidebar_fg`, `sidebar_hover`, `sidebar_active`, `sidebar_border`, `rope`, `terminal_paper`, `note_paper`, `note_ink`,
`glass_rgb`, `glass_highlight`, `icon`, `icon_soft`, `icon_softer`, `paper`.

An app's `command`, `args`, `env` and `cwd` may use `${port}` (a free port of 127.0.0.1), `${token}` (a secret kept
between starts), `${extensionPath}` and `${dataPath}` (the extension's own data folder). The program runs with no
console window and ends with the extension or with Orkestri; it is ready when its `health` path answers on its port.

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
- adds or changes an app's command, arguments or environment;
- may serve on anything but 127.0.0.1 (`0.0.0.0`, `::`, another host after `--host`, `--bind` and the like);
- changes a publisher's key or GitHub account, removes something, or touches files outside `extensions/` and
  `publishers/`.

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
- each extension: the manifest rules above, the folder named after the id, `icon.png` a PNG up to 256 KB,
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
- A new version: a new zip at a new address, then `node tools/registry.mjs add` again; describe what changed in the
  pull request (and in `CHANGELOG.md` if you keep one).
- Reporting a problem with an extension (it misbehaves, asks for more than it needs): open an issue naming its id and
  version.

Maintainers, after merging: `node tools/registry.mjs index <registry key file>` checks the whole registry, writes
`index.json` and signs it into `index.json.sig`; commit both to `main`.
