# Note format specification

The canonical contract for every note the `understand-codebase` skill writes. Notes are plain
markdown with YAML frontmatter and `[[wikilinks]]` — readable in Obsidian, Foam, Quartz, or any text
editor, with **no tooling required**.

## Folder layout

The knowledge base (KB) lives in one folder inside the *target* project (`.understand/` or
`docs/knowledge/` — see SKILL.md Step 5). Inside it:

```
index.md            # Map of Content (MOC) — the single entry point. Links out to everything.
concepts/           # one note per cohesive concept (an idea, pattern, or cross-cutting behaviour)
modules/            # one note per module / package / significant file group
architecture/       # layers, boundaries, data flow, external integrations, project-overview
domain/             # business nouns (the ubiquitous language) and how they map to code
tours/              # ordered guided reading paths for onboarding
sources/            # raw extracts and pointers to source files — kept SEPARATE from generated notes
```

Create only the folders you need. A tiny project may be just `index.md` + a handful of `concepts/`.

## File naming

- `kebab-case.md`, descriptive and stable (`request-lifecycle.md`, not `note-1.md`).
- The filename (without `.md`) is the note's link target: `[[request-lifecycle]]`.
- Renaming a note breaks inbound links — prefer getting the name right, or run the linter after a rename.
- **Keep basenames unique across the whole KB.** If `concepts/request.md` and `modules/request.md` both exist, `[[request]]` is ambiguous and different tools (and Quartz vs Obsidian) may resolve it to different targets. Either keep names unique, or use path-qualified links like `[[modules/request]]`. The linter reports ambiguous links separately from dead ones.

## Frontmatter schema

Every note begins with YAML frontmatter:

```yaml
---
title: Request lifecycle
type: concept            # one of: concept | module | architecture | domain | tour | source
tags: [http, middleware] # free-form topical tags
source_paths:            # the code files this note describes (relative to repo root)
  - src/server/router.ts
  - src/server/middleware/
source_commit: a1b2c3d   # git short SHA at extraction time — drives staleness checks
created: 2026-05-28      # ISO date
updated: 2026-05-28      # ISO date — bump on every Ingest
---
```

- `source_paths` + `source_commit` are what make staleness detectable: if any listed path has commits
  after `source_commit`, the note may be out of date. Architecture/domain/tour notes that don't map to
  specific files can omit `source_paths`.
- Keep frontmatter Obsidian/Quartz-compatible (plain scalars and lists only).

## Body conventions

- **One concept per note.** If a note tries to explain two unrelated things, split it.
- **Link, don't duplicate.** When a note refers to something described elsewhere, write `[[that-note]]`
  instead of restating it. The links *are* the graph.
- **Link syntax:** `[[note-name]]`, or `[[note-name|friendly text]]` to control the display text.
- **Quote source minimally.** Reference code by path and line range
  (`src/server/router.ts:40-72`) and link to a `sources/` note for longer extracts. Never paste large
  code blobs into a concept note.
- **Backlinks** are derived by the viewer (Obsidian/Quartz). For plain-markdown readers, the linter can
  materialise a `## Referenced by` section on request (`graph-lint.mjs --fix-backlinks`).

## Raw vs generated separation

`sources/` holds raw, low-interpretation material: a pasted config, a verbatim function, a copied doc
paragraph. Everything in `concepts/`, `modules/`, `architecture/`, `domain/`, `tours/` is *generated*
understanding that links down to `sources/` or to file paths. Keeping them separate means a future
re-analysis can regenerate the interpretation without losing the raw inputs.

## Portability

The notes are plain markdown, so the *text* is readable anywhere. The catch is `[[wikilinks]]`, which
render as actual links only in wiki-aware tools:

| Target | Wikilinks | Notes |
|---|---|---|
| Obsidian, Foam, Quartz | ✅ native | graph view + backlinks out of the box |
| Plain text / `cat` / bare editor | ⚠️ literal | readable, but `[[x]]` and the YAML frontmatter show verbatim |
| GitHub web UI | ❌ literal | `[[x]]` is **not** linked; renders as text |
| MkDocs / Docusaurus / VitePress / Hugo | ❌ unless plugin | these use `[text](path.md)`; need a wiki-link plugin or conversion |
| Logseq | ⚠️ partial | supports `[[x]]` but is block/outline-based, prefers a flat `pages/` dir (not folders), and uses `key:: value` props, not YAML |

If you need a non-wiki target (GitHub, a doc-site), **convert** `[[name]]` → `[name](relative/path.md)`
first (a small rewrite over the `[[…]]` matches). The custom frontmatter (`source_paths`,
`source_commit`) is ignored by other tools — harmless — but keep all frontmatter to plain scalars and
flat lists (no nested maps, no unquoted special characters) so every parser accepts it.

## `index.md` (Map of Content)

The entry point. It should contain:
- A one-paragraph description of the project.
- Links to the top architecture and domain notes.
- Links to the `tours/` notes ("Start here").
- A record of **which capabilities were provisioned** (notes / Quartz / query / hook) and which
  analysis stages have completed (for resumable runs).
