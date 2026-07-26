# Save format coverage

## Global container

| Area | Status | Notes |
|---|---|---|
| `BND4` signature | Verified | Rejected immediately if it does not match. |
| Header and slot offsets | Verified | 10 fixed-size slots. |
| `UserData10` | Verified | Global Steam ID, active profiles, name, level, and play time. |
| Slot checksum | Verified | Stored MD5 compared with the 0x280000 data bytes. |

## Character slot

| Group | Status | Main data |
|---|---|---|
| Version and map | Verified | Internal version and four map bytes. |
| `GaItem` | Verified/variable | Handles, IDs, and Ash of War association. |
| `PlayerGameData` | Verified | Attributes, resources, level, runes, class, name, flasks, online data, and DLC status. |
| Equipment | Verified | Hands, armor, talismans, ammunition, and active slots. |
| Inventory and chest | Verified | Common and key items, quantities, and indices. |
| Magic, pouch, and quick slots | Verified | Spells and item handles. |
| Gestures and projectiles | Verified | Equipped, unlocked, and acquired entries. |
| Flask of Wondrous Physick | Verified | Two crystal tear handles. |
| Regions and Sites of Grace | Verified | Unlocked regions and last Site of Grace. |
| Mount | Partially verified | Position, state, and HP; several bytes remain opaque. |
| Deaths and bloodstain | Verified | Count, runes, map, and position. |
| Player position | Verified | Coordinates, map, and angle; private by default. |
| Time/weather | Partially verified | Time and basic weather fields. |
| Event flags | Preserved and queryable | Complete bitfield; only cataloged IDs are resolved. |
| Special effects | Structurally verified | IDs and duration; names are not always available. |
| Online, tutorial, and system blocks | Indexed/opaque | Length, offset, and preview, with no invented semantics. |

## Semantics

Binary reading and name resolution are separate layers:

1. The parser obtains the exact value and preserves the ID.
2. The semantic layer looks up the ID in a catalog.
3. When an enriched record exists, it adds a functional summary, description, category, rarity, and storage limits.
4. Otherwise, it displays `ID 0x…` with `raw-id-only` confidence.
5. A catalog update can improve names without changing the parser.

## Event flags

The index uses blocks of 1,000 flags and a community BST mapping. Each block uses 125 bytes with bits in MSB-first order. If a block is not cataloged or lies outside the bitfield, the result is `null`, not `false`.

## Versioning and future compatibility

The export schema version is independent of the save file's internal version. Incompatible changes must increment the schema suffix (`semantic.v2`, for example). A game version newer than the validated range produces a warning; it never enables automatic writing or repair.
