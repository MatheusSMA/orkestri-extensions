# WezTerm

[WezTerm](https://wezterm.org), the open-source terminal emulator written in Rust, inside an Orkestri card as its own
window.

- **Installing it** downloads WezTerm's portable zip for Windows named in `orkestri-extension.json` from WezTerm's
  GitHub release, checks its size and sha256 (the release's own `.sha256` says the same) and unpacks it into
  `<profile>\apps\wezterm\<version>` (the zip's top folder dropped: WezTerm 20240203 crashes at start from a program
  path of 171 characters or more). Nothing is installed on the computer; this package holds no WezTerm file.
- **One WezTerm per card:** each card starts its own process (`start --always-new-process`) with its own config file,
  `wezterm.lua` in its folder of the extension's data (`instances\<card>`, seeded from `defaults/`): no update check,
  the tab bar only with two tabs, the window kept at the card's size. It never reads a `.wezterm.lua` of the person's
  own. It starts in the workspace's working folder (the profile's home without one), in WezTerm's default shell.
- **Zoom:** the card writes `font_size` into `orkestri.json` beside its `wezterm.lua`, which WezTerm watches and
  reloads, so the text follows the canvas zoom, never below 69 % of its size.
- **Agents** (`AGENTS.md`): a linked terminal runs a command line in it and reads its screen, through WezTerm's own
  `wezterm cli` (`send-text`, `get-text`) aimed at that card's process.
- WezTerm keeps one socket per running window in `%USERPROFILE%\.local\share\wezterm` (`gui-sock-<pid>`, empty files);
  WezTerm has no setting to move it. Closing the card, disabling the extension or closing Orkestri ends WezTerm and
  everything it started.
- Memory, one card: WezTerm 157 to 167 MB working set, plus its shell (cmd.exe 8 MB, OpenConsole 12 MB).

Licence: WezTerm is MIT (Wez Furlong), downloaded from its own GitHub release, never redistributed by this package.
