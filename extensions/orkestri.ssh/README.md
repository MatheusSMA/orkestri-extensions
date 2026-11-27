# SSH

A remote computer on the Orkestri canvas, in a card Orkestri draws itself, through Windows' own OpenSSH client
(`ssh.exe`, `scp.exe` in `System32\OpenSSH`, an optional feature of Windows 10 and 11; else whatever is on PATH).

- **The card** (canvas menu › Adicionar › SSH, or the simple view's "+"): new, it asks for the computer: **Endereço**
  (`user@host`, `host`, `host:port`, an IP), **Usuário**, **Porta** (22), **Chave** (a private key file, Procurar…
  opens the system's file box; your `~/.ssh/id_ed25519` when you have one), or one press on a host of your
  `~/.ssh/config` (its user, port and key are the config's). **Conectar** tests it. Connected, the header shows its
  name and a dot (online, no key login, changed host key, offline); the card shows its address, system, kernel,
  uptime, load, memory and disk (read again every 15 s while the card is on screen), and **Abrir terminal** (an
  Orkestri terminal beside it running `ssh -t …` there, linked to the card), **Testar**, **Editar**.
- **Agents**: a terminal linked to the card runs commands there and copies files (`AGENTS.md`):
  `orkestri code "<card>" run "uname -a"`, `put`, `get`, `info`.

Key login only: every call uses `BatchMode=yes`, so nothing ever waits for a password, and nothing asks for or keeps
one; the card keeps only the address, user, port and key file path. A computer that refuses it shows how to make a key
and give it the public part (`ssh-keygen`, then `type …\id_ed25519.pub | ssh user@host "… >> ~/.ssh/authorized_keys"`,
the Windows way of `ssh-copy-id`), with Copiar comandos. A computer seen for the first time has its key added to
`known_hosts` (`StrictHostKeyChecking=accept-new`, as most people answer the question); a key that changed is refused
and shown with its `ssh-keygen -R`.

## The program

`bin/ssh-panel.exe` (its source in `controller/`, Rust, `serde_json` its only dependency) is the card's controller:
`ssh-panel stdio`, which Orkestri keeps running while the extension is on and an SSH card needs it, one JSON line each
way per op (`{ id, op, args }` → `{ id, ok, text | error }`, each op on its own thread). The card's connection is the
first argument (`{ address | host, alias, user, port, key }`, checked: nothing ssh would read as an option):

- `config`: the hosts of `~/.ssh/config` (no patterns) and the default key, for the card's form.
- `probe <connection> <lang>`: one ssh call (`ConnectTimeout=5`) of a short POSIX `sh` probe (`/etc/os-release`,
  `uname`, `/proc/uptime`, `/proc/loadavg`, `/proc/meminfo`, `df -Pk /`), answered as the connection made whole
  (the key's `~` your folder), its name, state, a table of label and value, and the hint when it refuses. A computer
  without `sh` (Windows' own sshd) shows only "online".
- the agents' `info`, `run`, `put`, `get` (`run` and the copies stop at 25 s; Orkestri waits 30).

It reads `~/.ssh` from your own profile folder (Windows' known folder), as `ssh.exe` does, not from the profile Orkestri
gives its programs. No console windows.

Rebuild it after changing `controller/`: `cd controller && cargo build --release` (Rust 1.85 or later), with
`RUSTFLAGS=--remap-path-prefix=<your folders>=…` so it holds no path of your machine, then copy
`target/release/ssh-panel.exe` to `bin/`. `cargo test` checks the address, config and probe parsing and the protocol.
