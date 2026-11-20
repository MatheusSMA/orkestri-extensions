# draw.io

[draw.io](https://www.drawio.com) (diagrams.net), the open-source diagram editor by JGraph (Apache-2.0), inside an
Orkestri card, and terminals linked to the card draw in it.

- **Installing it** downloads draw.io's official static web app, `draw.war` of the
  [jgraph/drawio](https://github.com/jgraph/drawio/releases) release named in `orkestri-extension.json` (49 MB, checked
  against its pinned size and sha256, the release's own digest), which Orkestri unpacks into
  `<profile>\apps\drawio\<version>` (128 MB). That is all it needs: nothing is fetched afterwards and nothing is
  installed on the computer. This package holds no draw.io file.
- **A card is a diagram file.** Adicionar › draw.io (or Abrir in the store) makes a new card with a blank diagram whose
  file is a free name in the workspace's folder (`Diagrama.drawio`, `Diagrama 2.drawio`…; the profile's home when the
  workspace has none), written at its first change; every change is saved to the file (draw.io's autosave, no Save
  button). A card can show any `.drawio`, `.dio` or `.xml` diagram, or a PNG or SVG that holds one (draw.io's
  "editable" PNG and SVG, kept in that format when saved). The card remembers its file across restarts.
- **The card** is a portal card of Orkestri showing this package's page: it takes the mouse only once selected, zooms
  with the canvas, links to terminals like any portal, and is in the simple view. draw.io follows the app's theme
  (light or dark) and language when the card opens. Its server runs only while a draw.io card exists.
- **Offline**: draw.io runs in stealth mode (no feature that needs an outside service), and every page the program
  serves forbids reaching anything but itself (`Content-Security-Policy: default-src 'self' data: blob:`).
- **Agents** (`AGENTS.md`): a linked terminal runs `orkestri code "<card>" <op>`: `cells`, `add` (shapes, text, arrows
  as JSON), `delete`, `clear`, `read`, `load`, `mermaid`, `csv`, `export png|svg|pdf`, `open`, `save`. The PDF is the
  diagram's picture (draw.io makes PDFs only with an export server).

## The program

`drawio.exe` (its source in `server/`, Rust with no dependency) has two roles:

- `drawio serve <port> <token> <draw.io folder> <data folder> <page folder>`, the app Orkestri starts, on 127.0.0.1
  only (another `Host` or `Origin` is refused): draw.io's files under `/drawio/` (its `js/PostConfig.js` replaced by
  `page/PostConfig.js`: draw.io's own two lines, then the editor handed to the page through draw.io's plugin entry),
  the card's page (`page/index.html`, `page/page.js`) at `/`, and the card's API, which needs the cookie the card's
  first address (`/orkestri/open?t=<token>`) sets: `doc` (the card's file and its bytes), `save`, and the agents' ops
  (`op` from the controller, `next` and `answer` for the page, which waits for them). Each card's file is kept in
  `<data folder>\cards\<card>.txt`.
- `drawio op <op> [args]`, the manifest's `controller`, run by Orkestri for each op with the card in `ORKESTRI_*`
  variables: it resolves the agent's paths (`ORKESTRI_CWD`), reads the files it is given, writes exports, makes a
  file the card's (`open`, `save <file>`), and asks the card's page the rest through the server.

The page (`page/page.js`) holds draw.io in a frame in embed mode (`embed=1&proto=json`, its JSON protocol: `load`,
`export`, `autosave`) and changes the diagram with draw.io's own graph calls (`insertVertex`, `insertEdge`,
`removeCells`, `importXml` of `parseMermaidDiagram`, `importCsv`).

Rebuild it after changing `server/`: `cd server && cargo build --release` (Rust 1.85 or later), with
`RUSTFLAGS=--remap-path-prefix=<your folders>=…` so it holds no path of your machine, then copy
`target/release/drawio.exe` to the package folder. `cargo test` checks its encodings and that nothing outside draw.io's
folder is served.

## Licence

draw.io is under the Apache License 2.0 (Copyright JGraph Ltd and draw.io AG); the person's computer downloads it from
JGraph's own GitHub release, unchanged. "draw.io" and "diagrams.net" are JGraph's names, used here only to say what
this package opens; this package is not made or endorsed by JGraph, and its icon is our own. The package's own files
are under the Orkestri extensions registry's terms.
