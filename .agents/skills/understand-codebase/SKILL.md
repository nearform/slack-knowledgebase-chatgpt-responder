---
name: understand-codebase
description: "Build an interlinked markdown knowledge graph of an unfamiliar codebase and explore it. Scans the project, extracts modules/functions/relationships, writes one-concept-per-note Obsidian/Quartz/Foam-compatible markdown with [[wikilinks]] and backlinks, maps architecture and domain, and offers a guided tour. Adaptively asks which capabilities you want — knowledge notes, a Quartz graph viewer, a query/explore interface, incremental re-analysis on commits — and provisions only those. Use when onboarding to a new project, reverse-engineering legacy or undocumented code, ramping a teammate, or answering 'how does this whole system fit together and where does X live?'. Trigger on 'understand this codebase', 'map this repo', 'onboard me to', or 'build a knowledge base of this project'."
metadata:
  author: Gabriele Magno
  version: 1.0.0
  tags:
    - category/codebase-understanding
    - category/documentation
    - domain/engineering
    - tool/quartz
    - tool/obsidian
  compatibility:
    - all
---

# Understand Codebase

Help a developer understand an unfamiliar codebase by building a **persistent, interlinked knowledge graph of markdown notes** — one concept per note, cross-linked with `[[wikilinks]]` — and, optionally, by provisioning tools to explore that graph.

The output is not a one-off chat summary that evaporates when the session ends. It is a durable set of notes that lives in the *target* project, opens in any markdown/wiki reader (Obsidian, Foam, Quartz), grows as the code grows, and lets the developer — or a future Claude session — answer "how does this fit together?" by traversing links instead of re-reading the whole repo.

Synthesises three ideas: a staged **scan → extract → link → tour** analysis pipeline; the **persistent-wiki** discipline where the valuable work is the *bookkeeping* (cross-links, backlinks, freshness) and raw sources stay separate from generated notes; and a **graph view** front-end so the web of notes is browsable.

## Two principles that govern everything below

1. **Portable first, viewer optional.** Always produce plain markdown with `[[wikilinks]]` and YAML frontmatter. The *text* is readable anywhere, but `[[wikilinks]]` render as clickable links only in wiki-aware tools (Obsidian, Foam, Quartz) — **GitHub's web view and standard doc generators (MkDocs/Docusaurus/VitePress/Hugo) show them as literal text** unless converted or plugin-enabled. A graph viewer (Quartz) is an additive, opt-in convenience, never a dependency. See `references/note-format.md` → "Portability" for the support matrix and conversion guidance.
2. **Adaptive, not a fixed pipeline.** Do not bulldoze through a heavy end-to-end process. Ask which capabilities the user wants (see Step 2) and provision only those. A user who only wants notes should never get a git hook installed.

This skill is **read-only against the target's source code.** It writes notes into a knowledge folder *inside* the target project; it never edits the project's source, and never writes into this skills repo.

---

## Step 1 — When to use / when not to use

**Use it when** the user is:
- Onboarding to a new, large, legacy, or undocumented repo.
- Reverse-engineering "how does this system actually work / where does X live / how does data flow through it?"
- Ramping a teammate and wants living architecture docs.
- Building a knowledge base that should persist and stay current.

**Do NOT use it when:**
- The user has a single narrow question ("what does `parseConfig` return?"). Just read the code and answer — don't build a whole graph.
- The project already has a maintained wiki the user doesn't want duplicated. Offer the **Ingest** operation (Step 7) to extend it instead.
- The task is to *modify* code rather than understand it. This skill maps; it doesn't refactor.

If the request is borderline, ask one clarifying question rather than over-building.

---

## Step 2 — Intake: confirm the target, then ask which capabilities to provision

This is the load-bearing branch. **Before doing any heavy analysis:**

1. **Confirm the target project path** (default: the current working directory). Confirm it's the repo the user means.
2. **Present the capability menu and let the user pick a subset.** Use the host's structured question UI if available; otherwise ask in chat:

   > I can set up some or all of the following — which would you like?
   >
   > **(a) Knowledge notes** — scan the project and generate the interlinked markdown knowledge graph. *This is the foundation; the others build on it.*
   > **(b) Quartz graph viewer** — scaffold a local Quartz site so you can browse the notes with an interactive graph view, backlinks, and hover popovers. Requires Node 22+.
   > **(c) Query / explore interface** — drop a short `query-guide.md` and conventions into the knowledge base so you (or a future session) can ask questions against the notes and get answers grounded in citations.
   > **(d) Incremental re-analysis** — install a `post-commit` git hook that flags which notes went stale after a code change, so the graph stays fresh.

3. **Branching rules — enforce these:**
   - **(a) is a prerequisite for (b), (c), and (d).** If a user picks (b) without (a), generate at least a starter note set first, or confirm an existing knowledge folder for Quartz to point at.
   - **"Just do something sensible / everything"** → run **(a) + (c)**, then *offer* (b) and (d) explicitly. Never silently install a git hook.
   - **(d) requires a git repo.** Check `git rev-parse --is-inside-work-tree` first. Never overwrite an existing `post-commit` hook — append/chain, and ask before touching it. See `references/lint-checklist.md` for the hook snippet.
   - **Record the chosen capabilities** in the knowledge base's `index.md` so a later session knows what was provisioned.

---

## Step 3 — Analysis pipeline (capability a)

Deterministic-first, semantic-second. Lean on the built-in `Glob` / `Grep` / `Read` tools — Claude reading and reasoning about the code is the engine here. Heavier deterministic parsers (tree-sitter, `ctags`, a language server, `madge` for JS/TS import graphs) are an **optional enhancement** the user can ask for on a big or polyglot repo — never a dependency.

Run the stages in order, and **checkpoint after each** (record progress in `index.md`) so a large codebase can be processed across multiple passes and resumed.

1. **Project scan.** Detect languages, frameworks, package managers, build tooling, and entrypoints by reading manifests (`package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `pom.xml`, …), config, CI, and the directory shape. Respect ignore globs — skip `node_modules`, `dist`/`build`, `.git`, vendored deps, lockfiles, generated code. Produce the first two notes: `index.md` (the Map of Content) and `architecture/project-overview.md`.
2. **Module / concept extraction.** Walk the significant modules. For each, capture: its purpose, key exports (functions/classes/types), notable imports, and outbound call/dependency relationships (use `Grep` to trace who references what). **Write one note per *concept*, not blindly one per file** — merge trivial files, split a god-file by responsibility.
3. **Link pass.** Turn every relationship you found into a `[[wikilink]]`. This is where the graph forms. Prefer linking over restating: if note A mentions a thing described in note B, link to `[[B]]`.
4. **Architecture & domain map.** Synthesise higher-level notes: `architecture/` notes for layers, boundaries, data flow, and external integrations; `domain/` notes for the business nouns and how they map to code. Link these *down* to the concept/module notes.
5. **Guided tour.** Write one or more `tours/` notes — an ordered reading path ("start here → core request flow → extension points"), each step linking to the relevant notes. This is the onboarding payoff; make it genuinely walkable.
6. **Completeness review (Lint).** Audit the graph for orphans, dead links, stale notes, and contradictions (see Step 7 / `scripts/graph-lint.mjs`). Report gaps and offer to fill them.

---

## Step 4 — Note & markdown conventions

The full spec is in `references/note-format.md` and the node/edge vocabulary in `references/knowledge-graph-schema.md`. Summary of the contract every note must satisfy:

- **Folder layout** inside the knowledge base:
  ```
  index.md            # Map of Content — the entry point
  concepts/           # one note per cohesive concept
  modules/            # one note per module/package
  architecture/       # layers, data flow, integrations, project-overview
  domain/             # business nouns and how they map to code
  tours/              # ordered guided reading paths
  sources/            # raw extracts / pointers to source files (kept separate from generated notes)
  ```
- **File naming:** `kebab-case.md`, descriptive and stable.
- **One concept per note.** Each note is independently meaningful and addressable.
- **Frontmatter (YAML)** on every note: `title`, `type` (`concept|module|architecture|domain|tour|source`), `tags`, `source_paths` (the code files this note describes), `source_commit` (git SHA at extraction time — drives staleness checks), `created`, `updated`.
- **Links:** `[[note-name]]` or `[[note-name|display text]]`. Link, don't duplicate.
- **Backlinks:** don't hand-maintain giant backlink lists — let Quartz/Obsidian derive them. `graph-lint.mjs --fix-backlinks` can materialise a "Referenced by" section for plain-markdown readers if asked.
- **Raw vs generated separation:** generated notes *summarise and link to* `sources/` (or to file paths with line ranges). Never paste large code blobs into concept notes — quote minimally, link for the rest.

---

## Step 5 — Where the knowledge base lives + .gitignore

Ask the user which they prefer; default sensibly. **Put the notes in their own folder and keep the
optional Quartz site as a SIBLING — never let the site live inside the notes folder.** Quartz's
`content/` symlinks to the notes folder, so a site nested inside it makes the `--serve` watcher recurse
into the Quartz install's own `node_modules` (a cycle → `EMFILE: too many open files`). Recommended:

    .understand/
      notes/     <- the knowledge base (index.md, concepts/, modules/, architecture/, domain/, tours/, sources/)
      quartz/    <- optional Quartz site (capability b); its content/ -> ../notes

- **`.understand/notes/`** (default for "just let me explore") — local/ephemeral. Append `.understand/` to the target repo's `.gitignore`.
- **`docs/knowledge/`** (default for "document this for the team") — tracked and committed. Put any Quartz site OUTSIDE it (e.g. a top-level `.quartz-site/`) and gitignore the build output (`public/`, `.quartz-cache/`).

Rules: never write the KB into this skills repo or into `/tmp` for persistent output. When touching `.gitignore`, **append — never clobber** existing entries. The folder you pass as `--notes-dir` must not contain the `--site-dir` (the bootstrap script refuses if it does).

---

## Step 6 — Optional Quartz graph viewer (capability b)

Concise summary; full walkthrough in `references/quartz-setup.md`.

1. Verify Node 22+ **and npm ≥ 10.9.2** (the bootstrap script checks both).
2. Run `scripts/quartz-bootstrap.sh --notes-dir <kb> --site-dir <site>` (add `--reuse` to re-point an existing Quartz site instead of re-cloning). It scaffolds Quartz and wires `content/` to the notes folder.
3. `cd <site>` then `npx quartz build --serve` → the local URL for the graph view, backlinks, and popovers. (`npx quartz` only works *inside* the cloned site dir — there is no global `quartz`.)
4. Optional: `npx quartz sync` to deploy (e.g. GitHub Pages).

**Quartz version:** the bootstrap pins **v4.5.2** by default (its `create` is non-interactive). Quartz v5 is now the repo's default branch but changes the setup contract (interactive `create`, external wikilink/graph plugins, YAML config) — the script has a best-effort v5 path via `QUARTZ_VERSION=v5.0.0`, but v4.5.2 is the dependable default. Emphasise this is purely additive — the notes already work in Obsidian/Foam without it.

---

## Step 7 — Operations: Ingest / Query / Lint (the bookkeeping layer)

These are repeatable operations, not one-shots. They are where the long-term value lives.

- **Ingest** — add or update notes from a new source (a new module, a doc, a PR diff). Re-run scan/extract/link for only the changed surface; reuse existing notes; add `sources/` entries for raw inputs. Bump each touched note's `updated` and `source_commit`.
- **Query** — answer a user question by *traversing the graph*: start at `index.md`, follow `[[wikilinks]]`, read the relevant notes (and their `source_paths` when you need more depth), and answer **with citations back to specific notes**. Capability (c) just writes a short `query-guide.md` so this works repeatably across sessions.
- **Lint** — run `node scripts/graph-lint.mjs --notes-dir <kb> [--git-dir <repo>]` and apply `references/lint-checklist.md`: orphans (no inbound links), dead links (`[[x]]` with no note), stale notes (source changed past `source_commit`), missing backlinks, contradictions, oversized notes. Propose fixes; don't silently rewrite.

---

## Step 8 — Exploring the result

Tell the user concretely how to use what was built:
- Open the knowledge folder in **Obsidian** or **Foam** for local graph + backlinks, or
- Visit the **Quartz** local server (if capability b) for the web graph view, or
- Start any session with this skill and **ask questions** (the Query operation).

Always point them at `index.md` and the `tours/` notes as the entry points.

---

## Guardrails

- Read-only against the target's source code. Never modify it.
- Never install the git hook (capability d) without explicit consent; never overwrite an existing hook or `.gitignore` content — append/chain.
- Keep the knowledge base out of this skills repo and out of `/tmp` for anything persistent.
- Portable markdown always; the viewer is optional.
- One concept per note; link instead of duplicating; keep raw sources in `sources/`.
- Checkpoint long runs in `index.md` so they resume.
- Every Query answer cites the notes it drew from.
- Don't over-build: provision only the capabilities the user actually picked.
