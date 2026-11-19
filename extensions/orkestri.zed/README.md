# Zed

[Zed](https://zed.dev), the open-source code editor written in Rust, inside an Orkestri card as its own window: no
server, no web page, no Electron.

- **Installing it** downloads two files named in `orkestri-extension.json`, each checked against its pinned size and
  sha256: Zed's official installer for Windows x64 from Zed's GitHub release (`Zed-x86_64.exe`, signed by Zed
  Industries), and [innounp](https://github.com/jrathlev/InnoUnpacker-Windows-GUI), the Inno Setup unpacker, at a fixed
  commit. innounp unpacks Zed's files into `<profile>\apps\zed\<version>\zed`; the installer itself never runs, so
  nothing is installed on the computer (no entry in the installed apps, no menu, no file associations, no PATH). The
  installer stays beside it (62 MB) for a later preparation. This package holds no Zed or innounp file.
- **One Zed per card:** each card's Zed keeps its settings, keymap, extensions and language servers in its own folder
  of the extension's data (`instances\<card>`, Zed's `--user-data-dir`). It runs stateless (`ZED_STATELESS`): Zed's
  single-instance lock is one per Windows session, so without it a second card (or a Zed of the person's own) would
  take over the first; the price is that Zed does not reopen the last files when it starts again. It starts on the
  workspace's working folder (the profile's home without one). A window Zed opens on its own (File › New Window, a
  folder opened in a new window) is closed: it stays in its card.
- **Defaults** (`defaults/config`): no telemetry, no update checks, Zed's own font sizes, F24 bound to its file finder
  (how Orkestri opens a file in it), files saved when the focus leaves them (`autosave`: stateless, Zed cannot bring
  back unsaved changes after the card closes), and the folders it opens trusted (`session.trust_all_worktrees`:
  stateless, Zed cannot keep a trust decision and would ask at every start; the card opens the workspace's own folder).
- **Zoom:** the card writes `ui_font_size` and `buffer_font_size` into the card's `settings.json` as the canvas zooms
  (Zed reads it live), never below 69 % of its sizes; a `settings.json` the person filled with comments is left alone.
- **Agents** (`AGENTS.md`): a linked terminal opens a file at a line, `orkestri code "Zed" open path:line`. Zed offers
  nothing else from outside on Windows (no open editors, selection or problems).
- Closing the card, disabling the extension or closing Orkestri ends Zed and everything it started. Zed may leave a
  small crash-handler socket file in `%LOCALAPPDATA%\Zed`, which it always looks for there.
- Measured (Zed 1.29.2, one card, a Markdown file open): one process, 174 MB working set, 156 MB private.

Licences: Zed is GPL-3.0, AGPL-3.0 and Apache-2.0 (zed-industries/zed); innounp is GPL-3.0 (Jörg Rathlev). Both are
downloaded from their authors' own addresses, never redistributed by this package. Zed is a trademark of Zed
Industries; this extension is not made or endorsed by them.
