# Security policy

## Design guarantees

- The application is read-only: there is no code path that writes a `.sl2` or `.co2` file.
- Save parsing happens locally in a Web Worker.
- No backend, analytics SDK, cookies or persistent account storage are used.
- Sensitive fields are excluded from exports by default, including Steam IDs, precise location, event bytes, checksum digests and low-level IDs.
- Binary reads are bounds-checked, variable counts are capped before loops and the UI rejects files larger than 64 MiB.
- Active slots are validated against their stored MD5 checksum.
- Semantic catalogs are pinned to immutable commit hashes.

## Reporting a problem

Do not attach a real save file to a public issue. Redact Steam IDs, coordinates and character names, or create a minimal synthetic fixture. A useful report should include browser version, operating system, file size, internal slot version if visible, the exact error and the parser offset.

## Threat model exclusions

This is not a malware scanner and does not attempt to prove that a user-supplied file is harmless outside the parser. It only reads the file as an `ArrayBuffer`; it never executes content from it.
