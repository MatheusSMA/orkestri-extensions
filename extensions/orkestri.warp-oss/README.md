# Warp (open-source build)

Warp's open-source terminal client inside an Orkestri card as its own window. Built by Orkestri from
[warpdotdev/warp](https://github.com/warpdotdev/warp)'s AGPL source; not made or endorsed by Warp.

- **Installing it** downloads the build named in `orkestri-extension.json`: a release of the orkestri-extensions
  repository, made by its `build-warp` workflow from a pinned commit of warpdotdev/warp (`tools/warp/build.ps1` and
  `tools/warp/patch.ps1` there). The same release holds the exact source it was built from; the zip holds the AGPL-3.0
  and MIT licences, `SOURCE.md` and the third-party licences. Orkestri checks its size and sha256 and keeps it in
  `<profile>\apps\warp\<commit>`. This package holds no Warp file.
- **One Warp per card:** each card's Warp keeps everything in its folder of the extension's data
  (`instances\<card>\warp`: settings, history, its preferences), never in the person's AppData, home or registry, does
  not start with Windows and does not take over `warposs://` links (the build's changes, `SOURCE.md`). It starts
  already past Warp's welcome steps, in a shell session in the profile's home.
- **No account needed** for the terminal. Warp's AI, Warp Drive and sign-in use Warp's own servers, if the person
  signs in.
- **Zoom:** the card writes `appearance.text.font_size` into the card's Warp `settings.toml`, which Warp reloads
  live, so the text follows the canvas zoom, never below 69 % of its size; the other settings in that file stay.
- **Agents** (`AGENTS.md`): a linked terminal types a command line into it (`run`). Nothing else is possible from
  outside.
- Closing the card, disabling the extension or closing Orkestri ends Warp and everything it started.

Licence: the Warp client is AGPL-3.0 (its UI crates MIT), © Denver Technologies, Inc. The build is redistributed by
orkestri-extensions under those licences, with its source.
