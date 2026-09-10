# Lint checklist

The audit that drives the **Lint** operation (SKILL.md Step 7) and the completeness review
(Step 3.6). Most of it is automated by `scripts/graph-lint.mjs`; the judgement items need Claude.

Run the automated pass first:

```bash
node scripts/graph-lint.mjs --notes-dir <path/to/kb> [--git-dir <path/to/repo>] [--json]
```

## Automated checks (graph-lint.mjs)

- [ ] **Dead links** — every `[[target]]` resolves to a real note. Broken links are the #1 graph defect.
- [ ] **Ambiguous links** — a `[[name]]` whose basename exists in more than one folder. Reported
      separately from dead links; fix by qualifying the link (`[[folder/name]]`) or making basenames unique.
- [ ] **Orphans** — every note has at least one inbound link (except `index.md`). An orphan is
      unreachable by traversal, so it effectively doesn't exist in the graph.
- [ ] **Missing backlinks** — where A links to B, B optionally lists A under "Referenced by"
      (materialise with `--fix-backlinks`; otherwise leave to the viewer).
- [ ] **Stale notes** (needs `--git-dir`) — any note whose `source_paths` changed in a commit *after*
      its `source_commit`. These need re-Ingesting.
- [ ] **Missing provenance** (needs `--git-dir`) — a note that names `source_paths` but has no
      `source_commit`, so staleness can't be checked. Flagged separately (never silently treated as fresh).
- [ ] **Frontmatter validity** — `type` is one of the allowed values; `title` present.

## Judgement checks (Claude reviews)

- [ ] **Contradictions** — two notes that assert incompatible things about the same code. Reconcile.
- [ ] **Oversized notes** — a note covering several unrelated concepts. Split per "one concept per note".
- [ ] **Stub notes** — a note with a title and no real content. Either flesh out or remove.
- [ ] **Coverage gaps** — significant modules/entrypoints with no note at all. Compare the note set to
      the project scan from Step 3.1.
- [ ] **Tour integrity** — every step in a `tours/` note links to a note that still exists and reads in
      a sensible order.
- [ ] **Raw/generated leakage** — large code blobs that belong in `sources/`, not in concept notes.

## Acting on results

- Report findings grouped by severity (dead links and contradictions first).
- **Propose** fixes; don't silently rewrite notes. The user owns the knowledge base.
- After fixing, re-run the automated pass to confirm zero dead links / orphans.

## Capability (d): the incremental re-analysis hook

Capability (d) keeps the graph fresh by running the staleness check after each commit. It is **opt-in**
and installed only with explicit consent. Never overwrite an existing `post-commit` hook — append to it.

Suggested `.git/hooks/post-commit` snippet (the skill writes this only when the user picks capability d):

```sh
#!/bin/sh
# understand-codebase: flag knowledge notes that may be stale after this commit
if command -v node >/dev/null 2>&1; then
  node "<abs path>/graph-lint.mjs" --notes-dir "<abs path to kb>" --git-dir "$(git rev-parse --show-toplevel)" --stale-only || true
fi
```

- Make the hook executable (`chmod +x`).
- The `|| true` ensures a lint failure never blocks the developer's commit.
- If a `post-commit` hook already exists, append the `node ...` line to it instead of replacing the file.
