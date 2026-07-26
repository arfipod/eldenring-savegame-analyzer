# Export formats and privacy

## Semantic JSON

Schema: `eldenring-savegame-analyzer.semantic.v1`

Designed for human review and language models. It contains the character overview, attributes, build inference, resolved equipment, inventory, detected progress, coverage notes and methodology. Where the enriched catalog has a match, inventory entries may also include a functional summary, description, hint, rarity and holding/storage limits. Unknown values remain labeled as unresolved IDs rather than receiving invented names.

Default exclusions:

- Steam IDs.
- Precise coordinates, map IDs and orientation.
- Complete event-flag bitfield.
- Item handles, raw game IDs, entity IDs and offsets.
- Stored/computed MD5 digests.
- Hexadecimal IDs embedded in unresolved item names; these become generic ‘unresolved’ labels.
- Original save bytes.

The visible character name and the save's base filename remain included by design. Review or edit the exported text before posting it publicly.

## Forensic JSON

Schema: `eldenring-savegame-analyzer.forensic.v1`

Adds parsed structural data for debugging. With default privacy it exposes counts and redaction markers instead of raw handle arrays, IDs or offsets. Each sensitive group is enabled only by its corresponding switch.

## Markdown report

A paste-ready report with instructions for an AI to separate extracted facts, inferences and recommendations. The selected spoiler policy is enforced:

- `safe` and `zones`: only already detected content.
- `precise`: pending counts without names.
- `completion`: pending names, with an explicit spoiler warning.

## Spoiler policy in JSON

- `safe`: no future-content list.
- `zones`: same future-content protection, while retaining already known map labels.
- `precise`: counts pending catalog entries without their names.
- `completion`: emits the names of catalog entries whose flags are not set.

A flag that cannot be resolved through the catalog is treated as unknown, not as incomplete.
