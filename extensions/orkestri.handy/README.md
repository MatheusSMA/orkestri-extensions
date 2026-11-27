# Handy

Dictation by [Handy](https://handy.computer), the free and open-source speech-to-text app (MIT, by CJ Pais): it
records with its own shortcut or Orkestri's microphone button, transcribes on this computer (Whisper or Parakeet,
chosen and downloaded in Handy), and pastes the text into the field that has the keyboard.

- **Installing** downloads the official Handy 0.10.2 (pinned by its sha256) into Orkestri's own folder: on Windows x64
  its MSI (31 MB), unpacked by an administrative install (`msiexec /a`: files only); on Linux x86_64 its AppImage
  (118 MB), extracted once (`--appimage-extract`, no FUSE needed). You do not need Handy beforehand. Nothing is
  installed on the computer, nothing is added to the Start menu, and uninstalling the extension leaves it as it was.
- **Using it**: Settings › General › Voice › Dictation › Handy. The terminal's microphone button then runs
  `handy --toggle-transcription` (the running Handy takes it, or it starts and records) and Handy pastes what it heard
  into the terminal's field. Handy's first start asks for its model and the microphone; its settings (model, language,
  custom words, shortcut) are Handy's own.
- **Mixing languages**: Whisper (Turbo or Large in Handy) handles Portuguese speech with English terms better than the
  voice pack's model.

On Linux, Handy pastes with `xdotool` (X11) or `wtype` (Wayland); install the one of your desktop. A Handy the person
installed themselves is used when the extension's copy is not ready.

Not made or endorsed by Handy's authors; the Handy name and logo are theirs.
