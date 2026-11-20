# Alacritty

[Alacritty](https://alacritty.org), the fast open-source terminal emulator written in Rust, inside an Orkestri card as
its own window.

- **Installing it** downloads Alacritty's portable program for Windows named in `orkestri-extension.json` from
  Alacritty's GitHub release, checks its size and sha256 (GitHub's own digest of the asset says the same) and keeps it
  in `<profile>\apps\alacritty\<version>`. The program is not signed by its authors; the pinned sha256 is the check.
  Nothing is installed on the computer; this package holds no Alacritty file.
- **One Alacritty per card:** each card starts its own process with its own config file, `alacritty.toml` in its folder
  of the extension's data (`instances\<card>`, seeded from `defaults/`); it never reads an `alacritty.toml` of the
  person's own. It starts in the workspace's working folder (the profile's home without one), in Alacritty's default
  shell.
- **Zoom:** the card writes the font size into `orkestri.toml` beside its `alacritty.toml`, which imports it and
  reloads it live, so the text follows the canvas zoom, never below 69 % of its size.
- **Agents** (`AGENTS.md`): a linked terminal types a command line into it (`run`). Alacritty has no API to read its
  screen and no IPC on Windows, so that is all.
- Closing the card, disabling the extension or closing Orkestri ends Alacritty and everything it started.
- Memory, one card: Alacritty 86 MB working set (92 MB private), plus its shell (PowerShell 78 MB, conhost 8 MB).

Licence: Alacritty is Apache-2.0 or MIT (its authors), downloaded from its own GitHub release, never redistributed by
this package.
