# Validation record

Date: 2026-07-26

## What was validated in the delivery environment

- The binary parser and semantic/export layers passed strict TypeScript compilation.
- The React UI, Web Worker and Vite configuration passed strict TypeScript smoke-checks using temporary declarations for external packages.
- The unit-test sources passed strict TypeScript compilation.
- Nineteen unit assertions were executed for MD5, rune costs, event-flag addressing, fallback catalog IDs, catalog encoding, privacy redaction, spoiler enforcement, and English/Spanish localization.
- The enriched catalog adapter for tools, consumables and materials passed strict TypeScript compilation; its three pinned JSON endpoints were verified to exist at the recorded revisions.
- An end-to-end smoke test parsed the supplied real PC save, verified its stored slot MD5 and asserted representative identity, build, equipment, inventory and export results.
- Default semantic and forensic exports were searched for the real Steam IDs, precise coordinates, event bitfield, checksum digests and low-level entity/offset fields. None were present.
- Explicit opt-in exports were checked to ensure those technical fields appear only when requested.

The supplied `.sl2` file and generated personal exports are not part of this project.

## Environment limitation

The delivery sandbox could not access the npm registry, so it was not possible to install the declared dependencies or execute the final Vite production bundle there. The package versions are pinned exactly, and the source/configuration checks above passed. On a normal networked machine or in Vercel, run:

```bash
npm install
npm run check
```

Vercel should then install dependencies and execute `npm run build` using Node.js 22.x.
