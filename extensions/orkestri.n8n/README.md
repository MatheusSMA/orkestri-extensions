# n8n

[n8n](https://n8n.io), the workflow automation tool, running on this computer only, with its editor in an Orkestri
card. Terminals linked to the card list, create and run workflows and read their executions (`AGENTS.md`).

- **Installing it** finds Node.js 24 on the computer (`node.exe` on PATH answering `v24.`, with its npm), or downloads
  the official portable Node.js 24.22.3 for Windows x64 from nodejs.org (36 MB, checked against its pinned sha256) into
  `<profile>\apps\n8n\24.22.3`. Then `launch.js install` installs n8n 2.48.6 from npm into the extension's data folder
  (`<profile>\extensions-data\orkestri.n8n\n8n`, about 2.6 GB, a few minutes; npm's cache stays there and is deleted
  after): nothing global, nothing in the person's npm folders. It then starts n8n once and stops it, so its database,
  account, API key and start caches are ready before the first card. The store shows the progress. This package holds
  no n8n or Node.js file.
- **Running it:** n8n starts with Orkestri when a card of it is on the canvas (or when one is opened) and stops when
  its last card is deleted, with "Parar" in the store, or when Orkestri ends (no process is left). `launch.js serve`
  starts n8n on a free port of 127.0.0.1 with its data in the extension's data folder (`N8N_USER_FOLDER`), telemetry,
  version checks, banners and the personalization survey off, n8n's cloud AI assistant, AI builder, promotions and
  credits panel off (`N8N_DISABLED_MODULES`: the card opens on the workflow list), no tunnel, and serves the card on its
  own 127.0.0.1 port: a loading page until n8n answers, then n8n itself. n8n runs with `launch.js` as its preload,
  which keeps Node's compile cache and a cache of module resolutions in the extension's data folder (`cache`): they
  halve n8n's start on Windows.
- **The account:** n8n requires an owner account. The extension sets up a local one through n8n's own
  `N8N_INSTANCE_OWNER_*` settings (`owner@orkestri.local`, a random password kept in `owner.json` of the extension's
  data folder) and signs the card in with it, so the editor opens directly. Only the card is signed in: it gets a
  cookie from its first address, which carries a secret Orkestri keeps; a browser or program without it meets n8n's
  own sign-in. Requests from other sites (another `Host` or `Origin`) are refused.
- **Agents:** on the first start the extension makes an n8n API key with that account and keeps it in `api-key.json`
  of the extension's data folder; the agents never see it. They reach n8n through Orkestri (`orkestri code "n8n"
  workflows | create | run | executions`), answered by `launch.js` with n8n's public API (and n8n's own "execute
  workflow" call for `run`).
- Measured (n8n 2.48.6, Node.js 24.22.3, one machine): n8n ready about 7 s after it starts (14 s before the caches; its
  first start, about 30 s, happens at install), the card showing a loading page meanwhile; about 600 MB of memory while
  it runs (`launch.js`, n8n and its task runner).

Licences: n8n is fair-code under the [Sustainable Use License](https://github.com/n8n-io/n8n/blob/master/LICENSE.md):
free to use for your own internal business purposes or for non-commercial or personal use, which is how this
extension runs it (on your own computer, for you). The extension is free and does not distribute n8n: n8n is
downloaded by your computer from npm, n8n's own distribution, and by using it you accept its licence. Node.js is MIT
(OpenJS Foundation). n8n is a trademark of n8n GmbH; this extension is not made or endorsed by n8n GmbH, and its icon
is its own (n8n's logo is not used).

n8n 2.x warns that running outside a container is deprecated; n8n 3.0 will need Docker, so this extension stays on
n8n 2.
