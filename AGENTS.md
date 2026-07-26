# AGENTS.md

## Mission

Maintain a read-only, privacy-first Elden Ring PC save analyzer. Correctness and transparent uncertainty are more important than claiming 100% semantic coverage.

## Non-negotiable rules

1. Never add save-writing, repair, inventory injection or checksum-rewrite features.
2. Never upload a save or sensitive extracted data to a server.
3. Keep Steam IDs, coordinates, raw event flags and internal IDs opt-in in every export path.
4. Any variable-length binary read must be bounds-checked and capped.
5. Unknown data must remain unknown or opaque; do not guess field meanings.
6. Preserve the default spoiler policy as `safe`.
7. Do not commit real `.sl2`/`.co2` files or generated exports containing personal data.
8. Pin external semantic data to immutable commits and retain license notices.

## Validation before a change

```bash
npm run typecheck
npm test
npm run build
```

For parser changes, also test at least one known-good save copy and verify:

- BND4 signature accepted.
- Active slot count and profile names unchanged.
- MD5 status remains valid.
- Default semantic and forensic exports contain no Steam ID or precise coordinate.
- Parser end offset and opaque section index remain plausible.

## Architecture boundaries

- `save-parser.ts`: binary facts only.
- `semantic.ts`: names and event interpretation.
- `build-advisor.ts`: explicitly heuristic recommendations.
- `export.ts`: privacy and spoiler enforcement.
- `App.tsx`: presentation; do not hide parser failures.

## Commit style

Prefer small commits with tests. State whether a change affects binary parsing, semantic catalogs, privacy, spoiler behavior or UI only.
