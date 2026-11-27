# Música

Spotify or YouTube Music inside Orkestri, in a card of its own.

- **Adicionar › Música** makes the music card. Its two tabs:
  - **Spotify**: "Entrar com Spotify" signs in once in the browser (the login is kept). The card shows what plays (cover,
    track, artist, where it plays), back, play/pause and next, a search of songs and playlists and your playlists: a
    press plays it. The sound comes out of a Spotify app you have open (computer or phone); the foot of the card moves
    it to another one. Spotify lets other apps play only for **Premium** accounts.
  - **YouTube Music**: "Abrir YouTube Music" opens its web player in a portal beside the card, kept playing in the
    background (sign in there once, if you want your library). The card searches it and plays what you press.
- **The pill** in the canvas corner shows what plays with back, play/pause and next; a press on it opens the whole
  player above it (also in the UI mode, without the canvas).
- **Terminals**: link a terminal to the card and its agent controls Spotify:
  `orkestri code "Música" now | play [song | playlist name] | pause | next | prev | search text | playlists | devices | device name`.
  A YouTube Music portal answers `orkestri portal music "YouTube Music" play|pause|next|prev|now`.

Nothing is downloaded or installed: Spotify's Web API and YouTube Music's own web page.

Not made or endorsed by Spotify or Google; their names are theirs.
