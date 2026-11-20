# WezTerm

[WezTerm](https://wezterm.org), the open-source terminal emulator written in Rust, inside an Orkestri card as its own
window.

- **Installing it** downloads WezTerm's portable zip for Windows named in `orkestri-extension.json` from WezTerm's
  GitHub release, checks its size and sha256 (the release's own `.sha256` says the same) and unpacks it into
  `<profile>\apps\wezterm\<version>` (the zip's top folder dropped: WezTerm 20240203 crashes at start from a program
  path of 171 characters or more). Nothing is installed on the computer; this package holds no WezTerm file.
- **One WezTerm per card:** each card starts its own process (`start --always-new-process`) with its own config file,
  `card.lua` in its folder of the extension's data (`instances\<card>`, seeded from `defaults/`): no update check,
  the tab bar only with two tabs, the window kept at the card's size. It never reads a `.wezterm.lua` of the person's
  own. It starts in the workspace's working folder (the profile's home without one), in WezTerm's default shell.
- **Zoom:** the card writes `font_size` into `orkestri.json` beside its `card.lua`, which WezTerm watches and
  reloads, so the text follows the canvas zoom, never below 69 % of its size.
- **Agents** (`AGENTS.md`): a linked terminal runs a command line in it and reads its screen, through WezTerm's own
  `wezterm cli` (`send-text`, `get-text`) aimed at that card's process.
- **An Orkestri terminal** (`"kind": "terminal"`, 1.2.0): Conectar on its card, linked and listed as a terminal; its
  shell gets Orkestri's environment (`card.lua` puts the folder of the `orkestri` command first in PATH again, since
  WezTerm builds its shell's PATH from the registry), so agents inside run `orkestri list`, `ask`, `see`; asks reach it
  through the controller's `write` (`send-text --no-paste`), and `check`/`see` show its screen (`read`).
- **The controller** (`controller.exe`, its source in `controller/`, the manifest's `controller`): Orkestri runs it for
  each `orkestri code` op with the card in `ORKESTRI_*` variables and `WEZTERM_UNIX_SOCKET` (the manifest's `env`: the
  socket of the card's own WezTerm, `${userProfile}` and `${pid}` filled by Orkestri). `run` sends the line and a
  carriage return (`sent: <line>`), `write <text>` sends the text as given (Orkestri's asks), `read` answers the last 40 lines of the screen, anything else that it is not
  offered. Rebuild it after changing `controller/`: `cd controller && cargo build --release` (Rust 1.85 or later, no
  dependency), then copy `target/release/controller.exe` to the package folder; build with `--remap-path-prefix` so
  it holds no path of your machine.
- WezTerm keeps one socket per running window in `%USERPROFILE%\.local\share\wezterm` (`gui-sock-<pid>`, empty files);
  WezTerm has no setting to move it. Closing the card, disabling the extension or closing Orkestri ends WezTerm and
  everything it started.
- Memory, one card: WezTerm 157 to 167 MB working set, plus its shell (cmd.exe 8 MB, OpenConsole 12 MB).

Licence: WezTerm is MIT (Wez Furlong), downloaded from its own GitHub release, never redistributed by this package.
