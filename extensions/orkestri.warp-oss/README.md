# Warp (open-source build)

Warp's open-source terminal client inside an Orkestri card as its own window. Built by Orkestri from
[warpdotdev/warp](https://github.com/warpdotdev/warp)'s AGPL source; not made or endorsed by Warp.

- **Installing it** downloads the build named in `orkestri-extension.json`: a release of the orkestri-extensions
  repository, made by its `build-warp` workflow from a pinned commit of warpdotdev/warp (`tools/warp/build.ps1` and
  `tools/warp/patch.ps1` there). The same release holds the exact source it was built from; the zip holds the AGPL-3.0
  and MIT licences, `SOURCE.md` and the third-party licences. Orkestri checks its size and sha256 and keeps it in
  `<profile>\apps\warp\<commit>`. This package holds no Warp file.
- **One Warp per card:** each card's Warp keeps everything in its folder of the extension's data
  (`instances\<card>\warp`: settings, history, its preferences), never in the person's AppData, home or registry, does
  not start with Windows and does not take over `warposs://` links (the build's changes, `SOURCE.md`). It starts
  already past Warp's welcome steps, in a shell session on the workspace's folder (1.2.0, Orkestri 0.1.11:
  `WARP_INITIAL_WORKING_DIR`, which Warp's shell start-up goes to); the card's "Mudar pasta" starts it again on
  another folder. A card's Warp does not restore its last session (the build's change since `-5`: a restored session
  kept its old folder).
- **No account needed** for the terminal. Warp's AI, Warp Drive and sign-in use Warp's own servers, if the person
  signs in.
- **Zoom** (1.1.1, Orkestri 0.1.11): the card writes Warp's own zoom of its whole UI, `appearance.window.zoom_level`,
  into the card's Warp `settings.toml`, which Warp reloads live, so its text, tab bar and buttons follow the canvas
  zoom, never below 69 %; the other settings in that file stay. (Until 1.1.0 only the font size followed it, and
  Warp's tab bar stayed full size in a card zoomed out.)
- **Agents** (`AGENTS.md`): a linked terminal types a command line into it (`run`). Nothing else is possible from
  outside.
- **An Orkestri terminal** (`"kind": "terminal"`, 1.1.0): Conectar on its card, linked and listed as a terminal; its
  shell gets Orkestri's environment (the build puts the folder of the `orkestri` command first in PATH again, since
  Warp builds a session's PATH from the registry), so agents inside run `orkestri list`, `ask`, `see`; asks are typed
  into it (one line, 10 s after it opens); `check` shows nothing (no screen to read). With Orkestri 0.1.11 it calls
  its connections as a native terminal: the card's `@` tool (or Ctrl Shift 2 with the card selected) types a mention
  of a linked terminal, note, portal or group into Warp's input, and its Conectar links a group or a region.
- Closing the card, disabling the extension or closing Orkestri ends Warp and everything it started.

Licence: the Warp client is AGPL-3.0 (its UI crates MIT), © Denver Technologies, Inc. The build is redistributed by
orkestri-extensions under those licences, with its source.
