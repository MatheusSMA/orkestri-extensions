# VSCodium

[VSCodium](https://github.com/VSCodium/vscodium) (MIT), the open-source build of VS Code, inside an Orkestri card as
its own window: no server, no web page.

- **First start:** Orkestri downloads the portable VSCodium for Windows x64 named in `orkestri-extension.json` from
  VSCodium's GitHub release, checks its size and sha256, and unpacks it into `<profile>\apps\vscodium\<version>`. This
  package holds no VSCodium files.
- **Its data** (settings, extensions, history) stays in the extension's data folder of the Orkestri profile, VSCodium's
  portable mode (`VSCODE_PORTABLE`): it never touches another VS Code or VSCodium on the computer. The first start
  writes a few defaults there (`defaults/`): the native title bar (the card frames it), its dialogs and file pickers
  drawn inside its own window (they stay in the card), one window restored, no update prompts (Orkestri pins the
  version).
- **Abrir pasta** in the card's tool bar opens the workspace's working folder in it.
- Closing the card, disabling the extension or closing Orkestri ends VSCodium and everything it started.
