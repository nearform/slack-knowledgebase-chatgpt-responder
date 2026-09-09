# AGENTS.md

## Purpose

A ChatGPT-powered Slack bot that answers Nearform employees' questions from the company
knowledge base ("The Nearform way" in Notion). Three pieces run on Google Cloud: a crawler
that pulls Notion content to a GCS bucket, an embeddings job that turns that content into
vectors, and a Slack bot that retrieves the nearest chunks and asks OpenAI to answer from
them. When answering a question the bot must use only the crawled context, never its own
knowledge. The `summarize` shortcut is a separate capability that deliberately does not
use the corpus at all.

## Tech stack

- Node.js 24 (`.nvmrc`), ESM only (`"type": "module"` in each workspace package), no TypeScript
- npm workspaces monorepo (`packages/*`), npm lockfile v3
- `@slack/bolt` 5.x with `ExpressReceiver` (HTTP mode, not Socket Mode)
- `openai` 7.x (`gpt-4.1` for answers and summaries, `text-embedding-ada-002` for
  embeddings, `whisper-1` for audio transcription)
- `@notionhq/client` 5.x, `tiktoken-node`, `compute-cosine-similarity`, `json-2-csv`, `p-map`,
  `exponential-backoff`
- Google Cloud: Cloud Storage, Pub/Sub, Cloud Run jobs + functions
  (`@google-cloud/functions-framework` 5.x), Cloud Scheduler, Secret Manager. Storage,
  compute and scheduler are pinned to `europe-west1`; Pub/Sub topics and subscriptions and
  Secret Manager secrets are global and take no region.
- Tests: `node:test` (built in) with `sinon` for spies and fakes in all three packages
  (`sinon` is declared in `packages/slack-bot` and hoisted by npm workspaces). No Jest or
  Vitest.
- ESLint 10 flat config + Prettier 3, husky + lint-staged, commitlint (conventional commits)

## Project structure

| Path | Role |
|---|---|
| `packages/crawler` | Notion crawl to `scraped.csv` on GCS. See `packages/crawler/AGENTS.md`. |
| `packages/embeddings-creation` | `scraped.csv` to `embeddings.csv` via OpenAI. See `packages/embeddings-creation/AGENTS.md`. |
| `packages/slack-bot` | Bolt app: answers, summaries, transcription. See `packages/slack-bot/AGENTS.md`. |
| `.github/workflows` | CI (lint + test per workspace), the linked-issue PR check, manual releases, GCP deploy. |
| `Makefile` | Local run targets for each package. |
| `assets/` | `assets/schema.png`, the architecture diagram used by the README. |
| `docs/` | Per-subsystem specs, indexed by `docs/README.md`. |

## Commands

```bash
npm ci                                # install (workspaces)
npm test                              # all workspaces (node --test)
npm test --workspace=slack-bot        # one workspace
npm run lint                          # eslint . from the root
npm run lint --workspace=crawler      # one workspace
make crawl                            # run the crawler locally (writes .cache/scraped.csv)
make embeddings-start                 # embeddings function on :3002
make embeddings                       # POST a fake CloudEvent to trigger it
make bot-start                        # slack bot function on :3003
make bot-expose                       # ngrok tunnel for Slack's Request URL
```

`IS_LOCAL_ENVIRONMENT=true` (set by the `crawl`, `embeddings-start` and `bot-start`
targets, not by `embeddings` or `bot-expose`) swaps every GCS read/write for a file copy
under `.cache/`, so those runs never touch a bucket. Full setup, including the
Notion integration and Slack app manifest, is in `README.md`.

## Code style & conventions

Enforced by `eslint.config.mjs` (flat config, `eslint-plugin-prettier/recommended`),
`.prettierrc` (no semicolons, single quotes, no trailing commas, `arrowParens: "avoid"`)
and `.editorconfig` (LF, UTF-8, 2-space indent). Run `npm run lint` rather than reasoning
about the rules.

House style, from `packages/slack-bot/src/utils.js`:

```js
/**
 * Download a remote bucket file to a local destination
 */
export async function download(bucketName, fileName, destination) {
  if (isLocalEnvironment) {
    await fs.copyFile(path.resolve(rootCache, fileName), destination)
  } else {
    const storage = new Storage()
    const bucket = storage.bucket(bucketName)
    const file = bucket.file(fileName)
    await file.download({ destination })
  }
}
```

Named exports for helpers (`packages/slack-bot/src/bot.js` and
`packages/slack-bot/src/summarize.js` default-export their app and registrar), `node:`-prefixed builtin imports, async/await over promise chains, JSDoc
where a type is not obvious. Commit messages follow conventional commits (commitlint runs
on `commit-msg`). Releases are not derived from them: `.github/workflows/release.yml` is a
manual `workflow_dispatch` taking an explicit `semver` choice (`patch`, `minor` or `major`,
default `patch`) and running `nearform-actions/optic-release-automation-action@v4`, so a
human picks the version.

Every pull request body must link an issue, for example `Closes #123`.
`.github/workflows/check-linked-issues.yml` runs
`nearform-actions/github-action-check-linked-issues@v1` on every pull request and fails the
check when the body links none. Only `release/**` and `dependabot/**` branches are excluded,
so a PR opened without a linked issue is red on arrival.

## Engineering principles

- **TDD, tests first (MUST).** Write a failing `node:test` case that pins the intended
  behavior before the implementation, write only enough code to pass it, then refactor.
  New behavior lands with its test in the same change.
- **Green before commit (MUST).** `npm run lint` and `npm test` must both pass before you
  commit. lint-staged runs eslint on staged JS, but it is not a substitute for the suite.
- **Clean code and SOLID.** Small single-purpose functions, clear names, depend on the
  injected `openai` client rather than constructing one inside a helper (see `getAnswer`).
- **DRY, YAGNI, KISS.** The three packages deliberately duplicate small per-package utils helpers
  because they deploy independently: do not extract a shared package without asking.
- **Handle errors explicitly.** Fail fast with a meaningful error. Four swallow sites are
  deliberate and each degrades to something useful: the message handler posts a
  user-facing fallback, the locale lookup falls back to a default locale
  (`packages/slack-bot/src/bot.js:66`), `/healthz` answers 503, and the import-time
  embeddings load defers the retry to the next caller
  (`packages/slack-bot/src/getAnswer.js:222`). Do not add a swallow without that kind of
  reason. **One existing path is not in that category and should not be copied**: the
  Pub/Sub reload at `packages/slack-bot/src/getAnswer.js:83` acks first and then awaits
  the reload with no `try`/`catch`, so a failed reload is lost and the bot serves stale
  embeddings until a later message or a restart.
- **Validate at trust boundaries.** Slack requests are verified by `ExpressReceiver` via
  `SLACK_SIGNING_SECRET`; anything mounted outside that receiver is unauthenticated.
- **Observability.** `console.log`/`console.error` to stdout is the convention here (Cloud
  Run captures it). Never log a token, a signing secret, or a user's message content
  beyond what already exists.
- **12-factor.** Config comes from the environment only, processes are stateless apart
  from the in-memory embeddings cache, logs go to stdout.

## Testing

`node:test` with `--experimental-test-module-mocks`, tests in each package's `test/`
directory as `*.test.js`, fixtures in `test/mocks/`. Run with `npm test` (all workspaces)
or `npm test --workspace=<name>`. As of 2026-09-09 the suite is green. The root script runs one
`node:test` runner per workspace, reporting 4 in crawler, 1 in embeddings-creation and 19
in slack-bot. Two of slack-bot's 19 are the test-less fixture modules under `test/mocks/`,
which node's default glob executes, so there are 22 real tests across 24 reported.

Conventions: mock the network at the module boundary with `mock.module`, and use `sinon`
for spies and fakes. `embeddings-creation` needs `GCP_STORAGE_*` env vars, which its
`test` script supplies via `cross-env`.

## Security

- **Secrets live in the environment, never in the repo.** Local development uses a
  git-ignored `.env` (`*.env` is in `.gitignore`); production reads GCP Secret Manager,
  populated by `.github/workflows/deploy-step.yml` from repository secrets.
- Sensitive values in play: `OPENAI_API_KEY`, `NOTION_TOKEN`, `SLACK_BOT_TOKEN`,
  `SLACK_SIGNING_SECRET`. GCP auth in CI uses Workload Identity Federation, so there is no
  service-account key file to protect.
- **Slack request verification** comes from `ExpressReceiver`'s signing-secret check on
  `/slack/events`. `/healthz` in `packages/slack-bot/src/bot.js` is mounted outside that
  receiver and is therefore unauthenticated by design; keep it free of anything sensitive.
- **Client data.** The crawled Notion content is internal Nearform material and is sent to
  OpenAI. Treat `scraped.csv`, `embeddings.csv` and the `.cache/` directory as internal
  data: they are git-ignored, keep them that way.
- The GCS bucket is created with `--public-access-prevention` and uniform bucket-level
  access in `europe-west1`. Do not weaken either.
- **No credential is validated before use.** `SLACK_SIGNING_SECRET`, `SLACK_BOT_TOKEN`,
  `OPENAI_API_KEY` and `NOTION_TOKEN` are read from `process.env` and passed straight to
  constructors with no null or empty check, so a misconfigured deployment starts cleanly
  and fails at the first request with an opaque client-library error instead of naming the
  missing variable. `MAX_CONTEXT_TOKENS` is the only validated variable. If you add a new
  required variable, validate it at startup rather than following the existing pattern.
- Dependabot (`.github/dependabot.yml`) covers dependency updates; there is no SAST or
  secret-scanning step in CI and the repo has no SECURITY.md.

## Boundaries

- ✅ **Safe without asking:** edit source under `packages/*/src`, add or change tests, run
  `npm test` and `npm run lint`, read any workflow file.
- ⚠️ **The `make` targets are not in the safe tier.** `IS_LOCAL_ENVIRONMENT` redirects
  Cloud Storage reads and writes to `.cache/` and suppresses the bot's Pub/Sub subscribe
  (`packages/slack-bot/src/getAnswer.js:60`); it does not stop any other outbound call.
  `make crawl` hits the Notion API, `make embeddings` drives OpenAI embedding calls that
  cost money, and `make bot-expose` opens a public ngrok tunnel to a local service. Note
  `make embeddings` and `make bot-expose` do not set the flag at all. Ask first.
- ⚠️ **Ask first:** adding or upgrading dependencies, changing prompts or model ids in
  `packages/slack-bot/src/getAnswer.js` and `packages/slack-bot/src/summarize.js` (they change the bot's answers), altering the CSV schema
  shared between packages, editing anything under `.github/workflows`, changing GCP
  resource shape (memory, CPU, region, probes) in `.github/workflows/deploy-step.yml`.
- ⚠️ **Editing anything under `.agents/skills/` forks it from upstream.** That tree is
  vendored verbatim from the public `nearform/skills` and recorded in `skills-lock.json`.
  Change it and the repo diverges from upstream and the lockfile entry no longer describes
  what is on disk. To pull upstream changes use `npx skills update`; to fix a skill, fix it
  upstream. Ask before editing one in place.
- 🚫 **Never:** commit `.env`, `scraped.csv`, `embeddings.csv` or `.cache/` contents; print
  or log a token or signing secret; pass `--no-gpg-sign`; run `gcloud` commands that
  create, mutate or delete production resources; disable the bucket's public-access
  prevention; remove the Slack signature check.

## More context

- `README.md` — full first-time setup: Notion integration, GCP project, Slack app
  manifest, ngrok, and the per-package environment variable tables.
- `docs/README.md` — index of the per-subsystem specs (behavior, acceptance criteria,
  non-goals) generated from the code. Read a spec when you need the contract a change must
  preserve.
- `docs/knowledge/index.md` — knowledge base: an interlinked map of how the system works
  and why, with guided tours. Read it when you need the mechanism or the reasoning rather
  than the contract. Start at `docs/knowledge/tours/start-here.md`, or
  `docs/knowledge/query-guide.md` to navigate it by question.
- `packages/crawler/AGENTS.md`, `packages/embeddings-creation/AGENTS.md`,
  `packages/slack-bot/AGENTS.md` — scoped context for each subsystem.
- `slack_manifest.yaml` — the Slack app manifest (OAuth scopes and the `message.im` bot
  event subscription). Read it before changing which events reach the bot. The `summarize`
  shortcut is registered in code, not here.
- `.github/workflows/deploy-step.yml` — the authoritative description of how each package
  is deployed and what environment it gets.
- `skills-lock.json` — provenance for the vendored skills: source repo, path upstream, and
  a `computedHash` written by the skills CLI. The hash covers the whole skill directory as
  the CLI computes it, so it is **not** a bare `sha256` of `SKILL.md` and comparing it to
  one will not match. **Nothing in this repo verifies it**: there is no CI step, hook or
  script that reads the lockfile, so it is a provenance record for `npx skills update`, not
  an integrity guarantee. Verify against upstream by diffing, not by hashing.
