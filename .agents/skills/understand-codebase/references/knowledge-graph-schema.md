# Knowledge-graph schema

A shared vocabulary of **node types** and **edge types** so graphs come out consistent across runs
and across projects. Nodes are notes; edges are `[[wikilinks]]`.

## Node types (the `type` frontmatter field)

| `type`         | What it represents                                        | Folder          |
|----------------|-----------------------------------------------------------|-----------------|
| `concept`      | A cohesive idea, pattern, or cross-cutting behaviour      | `concepts/`     |
| `module`       | A module, package, or significant group of files          | `modules/`      |
| `architecture` | A layer, boundary, data flow, or external integration     | `architecture/` |
| `domain`       | A business noun / ubiquitous-language term mapped to code | `domain/`       |
| `tour`         | An ordered guided reading path                            | `tours/`        |
| `source`       | Raw extract or pointer to source files                    | `sources/`      |

## Edge types (how a link is phrased)

Edges are directional `[[wikilinks]]` placed in the body. Use a consistent phrasing so the relationship
is legible to a reader and (optionally) machine-extractable. Recommended phrasings:

| Edge          | Meaning                                  | Example phrasing in a note                          |
|---------------|------------------------------------------|-----------------------------------------------------|
| `imports`     | A depends on B at the code level         | "Imports [[config-loader]] for env parsing."        |
| `calls`       | A invokes B at runtime                    | "On each request it calls [[auth-middleware]]."     |
| `implements`  | A realises an interface/contract B        | "Implements the [[repository-interface]]."          |
| `depends-on`  | A needs B (service, infra, library)       | "Depends on [[postgres-pool]]."                     |
| `part-of`     | A is a component of larger B              | "Part of the [[http-layer]]."                       |
| `describes`   | A note documents source/concept B         | "Describes [[sources/router-snippet]]."             |
| `see-also`    | Weak association / related reading        | "See also [[caching-strategy]]."                    |

You don't need a separate field for the edge type — the surrounding sentence carries it. The point of
the table is to keep phrasing uniform so the graph reads consistently.

## Building the graph

1. **Nodes first** — create the notes during extraction (SKILL.md Step 3.2).
2. **Edges second** — the link pass (Step 3.3) walks each note and turns every discovered relationship
   into a `[[wikilink]]`, choosing the phrasing above.
3. **Higher-order nodes** — architecture/domain notes aggregate via `part-of` edges pointing *up* from
   modules and *down* to them, so the graph has both detail and overview.

## Quality targets for the graph

- **Connected:** no orphan notes (every note has at least one inbound link, except `index.md`).
- **Resolvable:** every `[[link]]` points to a real note (no dead links).
- **Navigable:** from `index.md` you can reach any note in a few hops via tours and architecture notes.
- **Right-sized nodes:** one concept per note; split god-notes, merge stubs.

These are exactly what `graph-lint.mjs` and `references/lint-checklist.md` check.
