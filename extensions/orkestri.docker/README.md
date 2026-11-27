# Docker

Your Docker containers in an Orkestri card. It uses the `docker` command already on the computer (Docker Desktop, or
any engine `docker` reaches through its context: WSL, a remote host); it downloads, installs and serves nothing.

- **The Docker card** (Adicionar › Docker) is Orkestri's own, drawn by the app in its look (kind `docker`, unlocked by
  this package: `contributes.cards`); this package brings only what it talks to. Its header shows the engine (its
  version, or that it is not running, with **Iniciar o Docker Desktop** when Docker Desktop is installed). Tabs:
  - **Contêineres**: grouped by compose project (`com.docker.compose.project`, a group folds), each with its state and
    health, image, ports (a click opens `http://localhost:<port>` in the browser: the container's own port), uptime,
    CPU and memory (`docker stats`); start or stop, restart, remove (a stopped one; a second press confirms) and logs
    (the last 200 lines under the row, refreshed on demand). A project's header starts, stops or restarts all of its
    containers (by label: no compose file needed).
  - **Imagens**: repository, tag, id, size, age; **Limpar imagens soltas** (`docker image prune -f`).
  - **Disco**: `docker system df`.

  It reads again every 3 s, on a thread, only while the card is drawn. Portuguese or English, as the app.
- **Agents** (`AGENTS.md`): a linked terminal runs `orkestri code "Docker" ps | logs | start | stop | restart | exec |
  images | stats`.

## The program

`docker-panel.exe` (its source in `controller/`, Rust with `serde_json` only) is the card's controller:
`docker-panel stdio`, kept alive by Orkestri while a Docker card needs it, one JSON line per op each way
(`{ id, op, args }` → `{ id, ok, text | error }`), each op on its own thread. The card's ops answer JSON: `engine`,
`containers` (`docker inspect` of `ps -aq`, with `stats`), `image-list`, `df`; and `start`, `stop`, `restart`,
`remove`, `logs`, `prune-images`, `project <start|stop|restart> <project>`, `desktop`. The agents' are `ps`, `logs`,
`start`, `stop`, `restart`, `exec`, `images`, `stats` (Orkestri passes on only those).

Every `docker` it runs has no console window and an end (15-300 s), and the person's own `USERPROFILE` and `HOME`
(Orkestri points them at its profile's home, where docker would find none of the person's contexts and ssh none of
their hosts). A name it is given that starts with `-` is refused, so it never reaches docker as a flag. Docker Desktop
is started through Explorer, so it is not ended with Orkestri.

Rebuild it after changing `controller/`: `cd controller && cargo build --release` (Rust 1.87 or later), with
`RUSTFLAGS=--remap-path-prefix=<your folders>=…` so it holds no path of your machine, then copy
`target/release/docker-panel.exe` to the package folder. `cargo test` checks how docker's JSON becomes the card's rows.

"Docker" is Docker, Inc.'s name, used here only to say what this package shows; it is not made or endorsed by Docker,
Inc., and its icon is our own.
