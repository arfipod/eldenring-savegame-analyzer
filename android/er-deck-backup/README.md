# ER Deck Backup for Android

Small Android app that connects to a Steam Deck by SSH/SFTP and downloads the
Elden Ring `ER0000.sl2` save without modifying the Deck.

## Version 1.1.0

- Remembers one SSH profile (host, port, user, password/private-key URI and `.bak` preference).
- Password and private-key passphrase are encrypted at rest with Android Keystore (AES-GCM).
- Password/passphrase fields are explicitly masked by default, with an opt-in visibility toggle.
- Adds a proper launcher label (`ER Deck Backup`) and a distinctive adaptive icon.
- Keeps strict host-key verification via the app-local `known_hosts` file.
- Downloads `ER0000.sl2` and optionally `ER0000.sl2.bak` to `Downloads/EldenRingBackups`.

The app never uploads or overwrites the save on the Steam Deck.
