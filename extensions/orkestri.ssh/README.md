# SSH

Your remote computers on the Orkestri canvas, through Windows' own OpenSSH client (`ssh.exe`, `scp.exe` in
`System32\OpenSSH`, an optional feature of Windows 10 and 11; else whatever is on PATH).

- **The SSH card** (canvas menu › Adicionar › SSH): every host, with its state (online, offline, no key login, changed
  host key) and, when it answers, its system, uptime, load, memory and disk. Testar conexão, Copiar comando (`ssh
  <name>`), Atualizar. Hosts are the `Host` entries of your `~/.ssh/config` (no patterns: `*`, `?`, `!`) plus the ones
  you add in the page (name, address, user, port, key file), which you can edit and remove.
- **A computer card** (Adicionar › Computador remoto): choose a host; the card shows its state and details (read again
  every 5 s while shown, one ssh call at most every 15 s), Testar conexão, and opens the SSH page at that host.
- **Agents**: a terminal linked to a computer card runs commands there and copies files (`AGENTS.md`):
  `orkestri code "<host>" run "uname -a"`, `put`, `get`, `info`, `check`; on the SSH card the host comes first.

Key login only: every call uses `BatchMode=yes`, so nothing ever waits for a password, and this package never asks for
or keeps one. A host that refuses it shows how to make a key and give the host its public part (`ssh-keygen`, then
`type …\id_ed25519.pub | ssh user@host "… >> ~/.ssh/authorized_keys"`, the Windows way of `ssh-copy-id`). A host seen
for the first time has its key added to `known_hosts` (`StrictHostKeyChecking=accept-new`, as most people answer the
question); a key that changed is refused and shown.

## The program

`ssh-panel.exe` (its source in `controller/`, Rust, `serde_json` its only dependency) has two roles:

- `ssh-panel serve <port> <token> <data folder>`, the service Orkestri runs while the extension is on, on 127.0.0.1
  only (another `Host` or `Origin` is refused): the page at `/` (the card's address `/?token=…` sets a cookie, then
  `/`), `/api/hosts`, `/api/status?name=` (`&fresh=1` for a new check), `/api/save`, `/api/remove`. The page's hosts
  are kept in `<data folder>\hosts.json` (`{ name, host, user, port, identityFile? }`). It also connects to
  `ORKESTRI_BRIDGE`, which is what makes Orkestri count the service as on (the computer cards wait for it); nothing
  is asked there, the controller answers.
- `ssh-panel op <op> [args]`, the manifest's `controller`, run by Orkestri for each op: the computer card's `items`,
  `item <host>` and `check <host>`, and the agents' `hosts`, `info`, `run`, `put`, `get`. `run` and the copies stop
  at 25 s (an op has 30).

A host's state is one ssh call (`ConnectTimeout=5`) running a short POSIX `sh` probe (`/etc/os-release`, `uname`,
`/proc/uptime`, `/proc/loadavg`, `/proc/meminfo`, `df -Pk /`), kept 15 s in `<data folder>\probe\`. A host without
`sh` (Windows' own sshd) shows only "online". The program reads `~/.ssh/config` from the person's own profile folder
(Windows' known folder), as `ssh.exe` does, not from the profile Orkestri gives its programs.

Rebuild it after changing `controller/`: `cd controller && cargo build --release` (Rust 1.85 or later), with
`RUSTFLAGS=--remap-path-prefix=<your folders>=…` so it holds no path of your machine, then copy
`target/release/ssh-panel.exe` to the package folder. `cargo test` checks the config and probe parsing.
