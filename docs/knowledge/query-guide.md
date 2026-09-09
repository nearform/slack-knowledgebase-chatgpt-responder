---
title: Query guide
type: architecture
tags: [query, conventions, how-to]
source_commit: c4bc5ac
created: 2026-09-09
updated: 2026-09-09
---

# Query guide

How to get answers out of this knowledge base, whether you are a person or a future Claude
session. Capability (c) of the `understand-codebase` skill.

## The traversal protocol

1. **Start at [`index.md`](./index.md).** It is the Map of Content; do not grep the folder
   blind.
2. **Pick the entry point by question shape** (table below), then follow `[[wikilinks]]`
   outward. The links are the index.
3. **Read a note's `source_paths` frontmatter** when you need more depth than the note
   carries, and go to the code. Notes summarise and point; they never replace the source.
4. **Answer with citations** back to the notes you used, by name, plus the `path:line`
   references those notes carry. An answer that cites nothing is not grounded.

## Where to start, by question shape

| The question is about... | Start at |
|---|---|
| "what is this project" | [[project-overview]] |
| "how do the parts connect" | [[pipeline-data-flow]] |
| "where does X live" | [[start-here]] then the relevant `modules/` note |
| a Slack behaviour | [[slack-event-surface]] |
| why an answer was wrong or empty | [[retrieval-augmented-answering]] then [[context-token-budget]] |
| an embedding or relevance question | [[cosine-distance-ranking]], [[chunking-strategy]] |
| a cold-start, timeout or 503 | [[embedding-lifecycle-and-warm-start]] |
| deployment, infra or a GCP resource | [[gcp-deployment-topology]] |
| running it locally | [[local-environment-emulation]] |
| writing or fixing a test | [[test-strategy-module-mocks]] |
| a business term | the `domain/` notes |
| a known bug or rough edge | the table at the end of [[start-here]] |

## How this relates to the other docs

Three artifacts, three jobs. Do not duplicate between them:

| Artifact | Answers |
|---|---|
| [`../../AGENTS.md`](../../AGENTS.md) | "what commands do I run, what conventions apply, what am I allowed to change" |
| [`../README.md`](../README.md) → the specs | "what is the contract, what must stay true, what do the tests guard" |
| this knowledge base | "how does it work and why is it like this" |

If you need a testable criterion, go to the specs. If you need the mechanism or the
reasoning, stay here.

## Conventions to keep when adding notes

- One concept per note; `kebab-case.md`; unique basenames across the whole base.
- Frontmatter on every note: `title`, `type`, `tags`, `source_paths` where they apply,
  `source_commit`, `created`, `updated`.
- **Link rather than restate.** If a fact belongs to another note, link to it.
- Reference code as `path:line`, never as a pasted blob. Long extracts belong in
  `sources/`.
- Bump `updated` and `source_commit` on every edit, so staleness stays detectable.

## Staleness

Every note records the commit it was extracted at (`c4bc5ac` for this run). To find notes
whose code has moved on:

```bash
git log --oneline c4bc5ac..HEAD -- <a note's source_paths>
```

Or run the vendored linter, which checks orphans, dead links and staleness together:

```bash
node .agents/skills/understand-codebase/scripts/graph-lint.mjs \
  --notes-dir docs/knowledge --git-dir .
```

No `post-commit` hook was installed, so staleness checking is a deliberate act. Re-run the
`understand-codebase` skill's Ingest operation to refresh a changed surface.
