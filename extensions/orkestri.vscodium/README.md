# VSCodium

[VSCodium](https://github.com/VSCodium/vscodium) (MIT), the open-source build of VS Code, inside an Orkestri card as
its own window: no server, no web page.

- **Installing it** downloads the portable VSCodium for Windows x64 named in `orkestri-extension.json` from VSCodium's
  GitHub release, checks its size and sha256, unpacks it into `<profile>\apps\vscodium\<version>` and installs the
  bridge into it (the store shows the progress). This package holds no VSCodium files.
- **One VSCodium per card:** each card keeps its own settings and history in the extension's data folder of the
  Orkestri profile (VSCodium's portable mode, `instances\<card>`); the extensions you add are shared. It never touches
  another VS Code or VSCodium on the computer. A new card starts with a few defaults (`defaults/`): no title bar of its
  own (the card frames it), the menu in the activity bar, dialogs and file pickers inside its window, no welcome page,
  no update checks, no telemetry. A window VSCodium opens on its own (File › New Window) is closed: it stays in its card.
- **The bridge** (`bridge/`, packed as `bridge.vsix`) connects the window to its card: its content follows the canvas
  zoom, and terminals linked to the card drive it (`AGENTS.md`: `orkestri code "VSCodium" open | editors | read |
  problems | run`). It is the package's controller (`"controller": "bridge"`): Orkestri passes each op as the agent
  gave it, and the bridge checks its arguments and takes a relative path from the agent's folder (`cwd`).
- **Its folder:** it opens on the workspace's working folder; the card's sub-bar shows it, and **Mudar pasta** opens
  another one in the same window (kept in the card for its next start).
- Closing the card, disabling the extension or closing Orkestri ends VSCodium and everything it started.

Rebuild `bridge.vsix` after changing `bridge/` (a zip with the files under `extension/`):

```
mkdir tmp\extension && copy bridge\* tmp\extension && tar --format zip -cf bridge.vsix -C tmp extension
```
