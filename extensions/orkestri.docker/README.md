# Docker

Your Docker containers in an Orkestri card, and a card per container. It uses the `docker` command already on the
computer (Docker Desktop, or any engine `docker` reaches through its context: WSL, a remote host); it downloads and
installs nothing.

- **The Docker card** (Adicionar › Docker, or Abrir in the store) is a page of this package's program, a service: it
  runs while the extension is on, whatever cards there are. It shows the engine (its version, or that it is not
  running, with **Iniciar o Docker Desktop** when Docker Desktop is installed); the containers grouped by compose
  project (`com.docker.compose.project`), each with its state and health, image, ports (links to
  `http://localhost:<port>`), uptime, CPU and memory (`docker stats`), and **Iniciar** / **Parar** / **Reiniciar**,
  **Remover** (a stopped one; a second press confirms), **Logs** (the last 200 lines, **Atualizar**) and **Detalhes**
  (`docker inspect`, folded); a project's **Iniciar tudo** / **Parar tudo** / **Reiniciar tudo** (its containers by
  label: no compose file needed). Tabs: **Imagens** (size, age, containers, **Remover**, **Limpar imagens soltas** =
  `docker image prune -f`), **Volumes** (**Remover**), **Disco** (`docker system df`). It reads again every 4 s, CPU and
  memory in their own loop, only while the page is seen. Portuguese or English, as the app.
- **A container card** (Adicionar › Container do Docker): pick a container; the card shows its state, image, ports,
  CPU and memory and project, with **Parar** / **Reiniciar** or **Iniciar**, **Logs** (its last two lines) and **Abrir
  no Docker** (the Docker card at that container). Orkestri draws it and reads it every 5 s. It follows the container
  by name, so a container made again by `docker compose up` keeps its card.
- **Agents** (`AGENTS.md`): a linked terminal runs `orkestri code "Docker" ps | logs | start | stop | restart | exec |
  images | stats`; on a container card the container is implied.

## The program

`docker-panel.exe` (its source in `controller/`, Rust with `serde_json` only) has two roles:

- `docker-panel serve <port> <token>`, the service, on 127.0.0.1 only (another `Host` or `Origin` is refused): the
  page (`controller/src/page.html`, built into the program) at `/`, which the card's first address
  (`/?token=<token>`) signs in with an `HttpOnly; SameSite=Strict` cookie, and its API under `/api/` (`engine`, `ps`,
  `stats`, `images`, `volumes`, `df`, `logs`, `inspect`; `do` and `compose` for actions), every call behind the cookie.
  `/health` answers the app's language.
- `docker-panel op <op> [args]`, the manifest's `controller`, run by Orkestri per op: the container card's `items`,
  `item <name>`, `start`, `stop`, `restart`, `tail`, and the agents' ops.

Every `docker` it runs has no console window and an end (25-120 s), and the person's own `USERPROFILE` and `HOME`
(Orkestri points them at its profile's home, where docker would find none of the person's contexts and ssh none of
their hosts). A name it is given that starts with `-` is refused, so it never reaches docker as a flag. Docker Desktop
is started through Explorer, so it is not ended with Orkestri. The service also connects to Orkestri's bridge
(`ORKESTRI_BRIDGE`), which is how Orkestri sees it is on, and answers the ops asked there as the controller does.

Rebuild it after changing `controller/`: `cd controller && cargo build --release` (Rust 1.87 or later), with
`RUSTFLAGS=--remap-path-prefix=<your folders>=…` so it holds no path of your machine, then copy
`target/release/docker-panel.exe` to the package folder. `cargo test` checks how docker's JSON becomes the container
card.

"Docker" is Docker, Inc.'s name, used here only to say what this package shows; it is not made or endorsed by Docker,
Inc., and its icon is our own.
