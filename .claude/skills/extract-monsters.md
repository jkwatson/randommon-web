# Extract Monster Data from PDF

Use this skill to extract descriptions and abilities from a Shadowdark sourcebook PDF and apply them to the corresponding JSON data file.

## Workflow

### Step 1 — Convert PDF to Markdown

From the `temp/` directory, run:

```bash
cd temp && uv run docling --image-export-mode=placeholder <filename.pdf>
```

This produces a `<filename>.md` file with excellent fidelity. The `pyproject.toml` in `temp/` already has docling as a dependency so `uv run` will install it automatically on first use.

### Step 2 — Understand the source format

Read the resulting markdown. Shadowdark sourcebooks follow this structure for each monster:

```
## Monster Name

<description paragraph(s)>

AC X, HP X, ATK ..., MV ..., S +X, D +X, C +X, I +X, W +X, Ch +X, AL [LNC], LV X

Ability Name. Description text.

Ability Name. Description text.
```

Watch for:
- Two-column layouts: abilities from monster A may appear interleaved with monster B's text. Cross-check against the JSON attack/stat fields to detect mismatches.
- Ability names that got split across lines (fragment names like "STR or grabbed" that are really part of a Grab description).
- Multi-word monster names split across lines.
- Adventure Seeds sections that should be ignored.

### Step 3 — Audit tags and biomes

Before writing the update script, check the existing JSON for tag/biome consistency:
- Every monster must have at least one tag and at least one biome.
- Use the terrain tables at the back of the sourcebook to verify biomes.
- Common tags: `animal`, `beast`, `aberration`, `construct`, `demon`, `dragon`, `elemental`, `fey`, `fiend`, `giant`, `humanoid`, `insect`, `magical beast`, `monstrosity`, `plant`, `undead`, `vermin`.
- Common biomes: `aquatic`, `cave`, `deeps`, `desert`, `forest`, `grassland`, `hills`, `mountain`, `river/coast`, `ruins`, `rural`, `swamp`, `tomb`, `urban`.

### Step 4 — Write an update script

Create `temp/update_<sourcebook>.py`. For each monster, call:

```python
set_monster("MONSTER NAME", "Description text.", [
    ("Ability Name", "Ability description."),
    ...
])
```

Use the hardcoded approach (not regex parsing) when the source is clean markdown. Reserve regex-based auto-parsing only for large monster counts (50+) where manual entry is impractical.

### Step 5 — Run and verify

```bash
python3 temp/update_<sourcebook>.py
```

The script should print any monsters with missing description or abilities. Then do a build check:

```bash
~/.cargo/bin/cargo build
```

A clean build confirms the JSON is valid and parses correctly.

## Notes

- The `description` and `abilities` fields are `Option<T>` in the Rust model — monsters without them load fine as `None`.
- The JSON field name for the stat block is `statblock` (no underscore) in some files; check the existing entries before adding new ones.
- For sourcebooks with 100+ monsters and two-column layout (like Unnatural Selection), use `pdftotext -layout` as a fallback and expect to need a correction pass for cross-contamination.
