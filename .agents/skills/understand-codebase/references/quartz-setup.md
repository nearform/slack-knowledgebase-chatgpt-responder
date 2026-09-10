# Quartz setup (opt-in graph viewer)

[Quartz](https://quartz.jzhao.xyz/) is a static-site generator that turns a folder of markdown +
`[[wikilinks]]` into a website with an **interactive graph view**, backlinks, transclusions, and hover
popovers. This is capability (b) — purely additive. The notes already work in Obsidian/Foam without it.

## Prerequisites

- **Node 22+** and **npm ≥ 10.9.2** (`node -v`, `npm -v`). The bootstrap script checks both.
- An existing knowledge base of notes (capability `a`) for Quartz to render.

## Fast path — the bootstrap script

```bash
scripts/quartz-bootstrap.sh --notes-dir <path/to/kb> --site-dir <path/to/site>
```

What it does:
1. Asserts Node ≥ 22.
2. Clones Quartz into `--site-dir` and installs its dependencies.
3. Wires Quartz's `content/` to your notes folder (symlink strategy) so the notes are the site content.
4. Prints the build/serve command.

Then (these `npx quartz` commands only work **from inside the cloned site dir** — there is no global
`quartz` CLI; `npx` resolves it from the local repo). Build once and serve the static output — this
skips the file-watcher and is the most reliable way to just *view* the graph:

```bash
cd <path/to/site>
npx quartz build           # writes the static site to ./public
npx serve public           # or: (cd public && python3 -m http.server 8080)
```

Open the printed local URL (default `http://localhost:8080`) → graph view, backlinks, and popovers.
Use `npx quartz build --serve` (watch + hot reload) only when you're actively editing the notes.

Already have a Quartz site? Re-point it at your notes instead of re-cloning:

```bash
scripts/quartz-bootstrap.sh --notes-dir <path/to/kb> --site-dir <existing/site> --reuse
```

For a reproducible setup, pin a version: `QUARTZ_VERSION=v4.5.2 scripts/quartz-bootstrap.sh ...`
(see "Version drift" below for why).

## Manual path

If you prefer to run it by hand (mirrors the official Quartz docs):

```bash
git clone --branch v4.5.2 https://github.com/jackyzha0/quartz.git <site-dir>   # pin v4; default branch is now v5
cd <site-dir>
npm install
npx quartz create -X symlink -s <path/to/kb> -l shortest   # -X strategy, -s source dir, -l link style
npx quartz build --serve
```

- `-X symlink` makes `content/` a symlink to your notes folder, so edits to notes show up on rebuild.
- `-s` is `--source` (the folder to symlink/copy from). Note: `-d` is `--directory` (content folder
  name), **not** the source — passing `-d` here is a common mistake.
- `-l shortest` matches the shortest-path wikilink resolution Obsidian uses.

## Deploying (optional)

```bash
npx quartz sync          # commits + pushes content; with GitHub Pages configured, publishes the site
```

See the Quartz hosting docs for GitHub Pages / Cloudflare / Netlify specifics.

## .gitignore

If the KB is tracked (`docs/knowledge/`), keep the **notes** tracked but ignore Quartz build output and
the cloned site:

```
# Quartz build artifacts
public/
.quartz-cache/
```

If you cloned Quartz into a sibling folder inside the repo, gitignore that folder too. The
bootstrap script prints the exact lines to append — **append, never clobber** existing `.gitignore`
entries.

## Versions: why this pins v4 (and what v5 changes)

The bootstrap script **defaults to Quartz `v4.5.2`** (the newest v4 release) because v4's `create` flow
is fully non-interactive — exactly what an automated setup needs.

Quartz's current release is **v5** (released 2026-03; now the repo's *default branch*, so an unpinned
`git clone` gets v5). v5 keeps every feature we rely on — wikilinks, transclusions, graph view,
backlinks, Obsidian compatibility (Node/npm requirements are identical) — but changes the setup
contract in three ways that break a zero-touch bootstrap:

1. `quartz create` adds a **mandatory interactive template chooser** (`-t/--template`) and a baseUrl
   prompt (`-b/--baseUrl`); without them it blocks waiting for input.
2. Wikilinks, graph, and backlinks are **no longer built in** — they're external community plugins
   installed via `npx quartz plugin install --from-config` *before* `build`.
3. Config moved from `quartz.config.ts` to `quartz.config.yaml`.

The script has a **best-effort v5 path**: set `QUARTZ_VERSION=v5.0.0` (or `QUARTZ_VERSION=""` for the
latest default branch) and it adds `-t default -b "$QUARTZ_BASE_URL"` and runs the plugin-install step
for you. That path isn't battle-tested by this skill yet — if the graph doesn't render, follow the v5
plugin docs. **For a dependable graph viewer today, keep the v4.5.2 default.**

(The `git clone --branch v4.5.2` warning *"refs/tags/v4.5.2 … is not a commit"* is benign — it's an
annotated tag; the clone still checks out the right commit.)

## Troubleshooting

- **`quartz: not found`:** you're not inside the cloned site dir. `npx quartz …` is not global — `cd`
  into `<site-dir>` first.
- **`EMFILE: too many open files, watch` (then an esbuild deadlock):** the `--serve` watcher tried to
  watch too many files — almost always because the **site dir sits inside the notes dir**, so
  `content/` recurses into the Quartz install's own `node_modules`. Keep the notes dir small and put
  the site dir **outside** it (the bootstrap script enforces this). Quick fix: skip `--serve` —
  `npx quartz build` then serve `public/` statically. (Raising `ulimit -n` rarely helps; the cause is
  the watch *cycle*, not the limit.)
- **Wikilinks don't resolve:** ensure `-l shortest`. If a `[[name]]` is **ambiguous** (the same basename
  exists in two folders), Quartz and Obsidian may resolve it differently — use a path-qualified link
  like `[[folder/name]]`, or keep basenames unique across the KB. Run
  `node scripts/graph-lint.mjs --notes-dir <kb>` first; it reports dead **and** ambiguous links.
- **Node/npm too old:** Quartz needs Node 22+ and npm ≥ 10.9.2 (`nvm install 22 && nvm use 22`;
  `npm install -g npm@latest`).
- **Empty graph:** confirm `content/` actually points at the notes folder (`ls <site-dir>/content`).
