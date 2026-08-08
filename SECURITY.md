# Security policy

## Design guarantees

- The application is read-only: there is no code path that writes a `.sl2` or `.co2` file.
- Save parsing happens locally in a Web Worker.
- No remote backend, analytics SDK, cookies or persistent account storage are used.
- Sensitive fields are excluded from exports by default, including Steam IDs, precise location, event bytes, checksum digests and low-level IDs.
- Binary reads are bounds-checked, variable counts are capped before loops and the UI rejects files larger than 64 MiB.
- Active slots are validated against their stored MD5 checksum.
- Semantic catalogs are pinned to immutable commit hashes.

## Local Steam Deck bridge

The Vite development and preview servers expose a same-origin, loopback-only UI flow for read-only SSH/SFTP retrieval. The bridge:

- accepts only private IPv4 targets and syntactically valid Linux usernames;
- accepts requests only from a loopback client on the same origin;
- requires the remote host key to match an existing OpenSSH `known_hosts` entry before password authentication;
- limits request bodies, remote identity reads, directory scans, and save streams;
- verifies `/etc/os-release` identifies SteamOS before searching for a save;
- searches only fixed Proton paths for app ID `1245620`;
- never executes a remote shell command or writes to the remote filesystem;
- never logs, stores, or returns the password, Steam ID, or remote path;
- streams at most 64 MiB and closes the SSH connection after the response.

The form refuses to send credentials unless the analyzer itself is open on `localhost` or another loopback address. Static hosting does not provide the bridge.

## Reporting a problem

Do not attach a real save file to a public issue. Redact Steam IDs, coordinates and character names, or create a minimal synthetic fixture. A useful report should include browser version, operating system, file size, internal slot version if visible, the exact error and the parser offset.

## Threat model exclusions

This is not a malware scanner and does not attempt to prove that a user-supplied file is harmless outside the parser. It only reads the file as an `ArrayBuffer`; it never executes content from it.
