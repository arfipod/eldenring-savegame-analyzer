# Elden Ring Savegame Analyzer

A read-only React application for analyzing **Elden Ring PC save files** (`ER0000.sl2` and `.co2`) directly in the browser. It converts the binary BND4 format into an understandable view and structured exports designed for human review or use with a language model.

> The requested package name is preserved as `eldenring-savegame-analyzer`. The interface uses “Elden Ring Savegame Analyzer” as its display name.

## Features

- Local parsing of all 10 slots and the global profile table.
- Validation of the BND4 signature, read bounds, and the MD5 checksum of each active slot.
- Level, starting class, name, play time, attributes, HP/FP/stamina, runes, total runes, deaths, and bloodstain.
- Complete equipment data: weapons, armor, talismans, quick slots, pouch, spells, and Flask of Wondrous Physick mixture.
- Inventory and chest contents with quantities, upgrades, type, equipped status, and semantic confidence. Tools, consumables, and materials may also include functional summaries, rarity, and storage limits.
- Regions, last Site of Grace, world time, mount, effects, DLC status, and numerous internal blocks.
- Milestones inferred from save flags: bosses, Sites of Grace, cookbooks, bell bearings, and whetblades when the catalog recognizes them.
- Automatic build analysis and recommendations based on evidence from the save file.
- Level cost calculator.
- Four spoiler policies: spoiler-safe, zones only, unnamed counts, and completionist.
- Semantic JSON, forensic JSON, and AI-ready Markdown exports.
- Configurable privacy; Steam IDs, coordinates, internal IDs, and the event bitfield are excluded by default.
- Heavy processing runs in a Web Worker to keep the interface responsive.
- Responsive design suitable for Steam Deck and touchscreens.
- Complete English and Spanish localization with a persistent in-app language switch.

## Privacy and security

The selected file is read with `File.arrayBuffer()` in the browser and transferred to a Web Worker. There is no API, database, telemetry, or save-file upload. The application never writes to the original file and contains no editing features.

To give names and context to internal IDs, the application downloads static JSON catalogs from pinned revisions of community projects. Progress lists are combined with enriched records for tools, consumables, and materials. These requests **contain no save data**. If they fail, the application uses a minimal built-in catalog and the binary parser continues to work.

The default export removes:

- Global and character Steam IDs.
- Precise coordinates and orientation.
- The complete event bitfield.
- Low-level handles, offsets, and internal IDs.
- Stored and computed MD5 fingerprints.
- The original binary file.

The visible character name and the save file's base name are included so the report can be identified. Review the JSON before sharing it publicly.

## Honest coverage

The save format is not officially documented. The application interprets structures known through community research and displays an index of opaque blocks for everything that does not yet have reliable public semantics. “Complete” means that the product is ready to use and preserves unknown information in a traceable form; it does not mean inventing a meaning for every byte.

The “achievements” shown in the interface are **inferred milestones** based on inventory and flags. They are not a substitute for the official Steam achievement history.

See [`docs/FORMAT_COVERAGE.md`](docs/FORMAT_COVERAGE.md) for technical details and [`docs/EXPORTS.md`](docs/EXPORTS.md) for schemas, spoiler behavior, and privacy rules.

## Local development

Requirements:

- Node.js 22.12 or later.
- npm 10 or later.

```bash
npm install
npm run dev
```

The application will be available at the URL reported by Vite, usually `http://localhost:5173`.

### Validation

```bash
npm run typecheck
npm test
npm run build
```

Or run the complete suite:

```bash
npm run check
```

## Deploying to Vercel

1. Push this directory to a Git repository.
2. Import the repository into Vercel.
3. Vercel will detect Vite automatically.
4. Keep the default values:
   - Build command: `npm run build`
   - Output directory: `dist`
   - Install command: `npm install`
5. Deploy.

You can also use the CLI:

```bash
npm install -g vercel
vercel
vercel --prod
```

[`vercel.json`](vercel.json) provides the SPA fallback and security headers. No environment variables are required. See also [`docs/DEPLOY_VERCEL.md`](docs/DEPLOY_VERCEL.md).

## Architecture

```text
src/
├── App.tsx                  Interface and user flow
├── worker/save.worker.ts    Parsing outside the main thread
├── lib/save-parser.ts       BND4 and binary structure parsing
├── lib/binary-reader.ts     Safe little-endian reads
├── lib/md5.ts               Dependency-free checksum validation
├── lib/catalog.ts           Pinned semantic catalogs and caching
├── lib/semantic.ts          ID and progress resolution
├── lib/build-advisor.ts     Build inference and rune-cost curve
├── lib/export.ts            JSON/Markdown and privacy rules
├── data/fallback-catalog.ts Minimal offline catalog
└── types.ts                 Data contracts
```

The parser does not depend on React, so it can be reused with another interface. The semantic layer is separate from parsing: a binary value can be correct even when its name is not yet in the catalog.

## Exports

### Semantic JSON

This is the recommended option for an AI. It includes useful data, build interpretation, equipment, inventory, and progress, together with methodology and privacy notices.

Current schema:

```text
eldenring-savegame-analyzer.semantic.v1
```

### Forensic JSON

Adds the parsed structure and technical counts while continuing to respect the privacy controls. The event bitfield, low-level IDs, and MD5 fingerprints appear only with explicit opt-in.

### Markdown report

Generates a self-contained prompt with anti-spoiler rules and a readable inventory. It can be pasted directly into ChatGPT or another model. Precise mode adds only pending counts; completionist mode may add names and displays an explicit warning.

## Compatibility

- Native Elden Ring PC save files with a `BND4` signature.
- `.sl2` and `.co2` extensions.
- The file supplied during development, with internal version 252, was used as a real-world test without being added to the repository.
- PlayStation/Xbox saves and formats compressed or encrypted by external tools are not supported.

## Validation record

Parser, privacy, TypeScript, and test-save validation are documented in [`VALIDATION.md`](VALIDATION.md). The real save file is not included.

## Known limitations

- Names and descriptions depend on community catalogs and may take a few seconds to load the first time. The parser and the minimal built-in catalog remain available offline.
- Future game updates may introduce new fields or versions. The parser fails safely or displays a warning instead of writing incorrect data.
- Build analysis is heuristic: it reports its evidence and avoids presenting recommendations as game facts.
- Exact damage, equip load, and resistances are not calculated because those values require complete regulation parameters and additional scaling rules.
- The application does not query Steamworks, so it cannot certify official achievements.

## Intellectual property

This is an unofficial project and is not affiliated with FromSoftware or Bandai Namco Entertainment. “Elden Ring” and its data belong to their respective owners. The project does not distribute game graphics, audio, or files.

See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for community data attribution.

## License

Original code is licensed under the MIT License. External data retains its original licenses and attribution.
