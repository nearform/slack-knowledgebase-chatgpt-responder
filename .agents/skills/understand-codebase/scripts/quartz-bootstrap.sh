#!/usr/bin/env bash
#
# quartz-bootstrap.sh — opt-in helper for the understand-codebase skill (capability b).
# Scaffolds a Quartz site whose content is your generated knowledge base, so you can browse the
# notes with an interactive graph view, backlinks, and popovers.
#
# This script does NOTHING unless you run it. It is portable bash, clones Quartz, and never touches
# your source code or knowledge notes (it only points Quartz's content/ at them via symlink).
#
# Usage:
#   quartz-bootstrap.sh --notes-dir <path/to/kb> --site-dir <path/to/site> [--reuse]
#
#   --reuse          re-point an EXISTING Quartz site at your notes (skip clone + install)
#   QUARTZ_VERSION   env var: Quartz tag/branch/commit to clone. Default v4.5.2 (a known-good tag
#                    whose 'create' is fully non-interactive). Set to "" for the repo default
#                    branch (currently v5 — see the v5 caveats in references/quartz-setup.md).
#   QUARTZ_BASE_URL  env var: base URL used only by the best-effort v5 path (default localhost:8080)
#
# Then (run from INSIDE the cloned site dir — there is no global 'quartz' CLI):
#   cd <path/to/site> && npx quartz build --serve
#
set -euo pipefail

NOTES_DIR=""
SITE_DIR=""
REUSE=0
QUARTZ_REPO="https://github.com/jackyzha0/quartz.git"
# Default to a known-good v4 tag: v4's 'create' is fully non-interactive. The repo default branch is
# now v5, whose 'create' forces interactive prompts and moves wikilinks/graph to external plugins.
QUARTZ_VERSION="${QUARTZ_VERSION:-v4.5.2}"
QUARTZ_BASE_URL="${QUARTZ_BASE_URL:-http://localhost:8080}"   # only used on the best-effort v5 path

usage() {
  # Skip the shebang (line 1) so it doesn't appear in the help output.
  tail -n +2 "$0" | grep '^#' | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --notes-dir) NOTES_DIR="${2:-}"; shift 2 ;;
    --site-dir)  SITE_DIR="${2:-}";  shift 2 ;;
    --reuse)     REUSE=1; shift ;;
    -h|--help)   usage 0 ;;
    *) echo "Unknown argument: $1" >&2; usage 1 ;;
  esac
done

[ -n "$NOTES_DIR" ] || { echo "Error: --notes-dir is required" >&2; usage 1; }
[ -n "$SITE_DIR" ]  || { echo "Error: --site-dir is required"  >&2; usage 1; }
[ -d "$NOTES_DIR" ] || { echo "Error: notes dir does not exist: $NOTES_DIR" >&2; exit 1; }

# --- assert Node >= 22 ---------------------------------------------------------
command -v node >/dev/null 2>&1 || { echo "Error: Node.js is not installed (need v22+)." >&2; exit 1; }
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Error: Quartz needs Node 22+, found $(node -v). Try: nvm install 22 && nvm use 22" >&2
  exit 1
fi

# --- assert npm >= 10.9.2 (Quartz's other engine requirement) ------------------
NPM_VERSION="$(npm -v 2>/dev/null || echo 0.0.0)"
if ! node -e 'const c=(a,b)=>{a=String(a).split(".").map(Number);b=b.split(".").map(Number);for(let i=0;i<3;i++){const d=(a[i]||0)-(b[i]||0);if(d)return d}return 0};process.exit(c(process.argv[1],"10.9.2")>=0?0:1)' "$NPM_VERSION"; then
  echo "Error: Quartz needs npm >= 10.9.2, found $NPM_VERSION. Try: npm install -g npm@latest" >&2
  exit 1
fi

# --- resolve absolute notes path (for the symlink) -----------------------------
NOTES_ABS="$(cd "$NOTES_DIR" && pwd)"

# Guard: the site dir must NOT live inside the notes dir (or vice versa). content/ symlinks to the
# notes dir, so a site nested inside it means the --serve watcher follows content/ into the Quartz
# install's own node_modules — a cycle that exhausts file handles (EMFILE) and deadlocks esbuild.
mkdir -p "$(dirname "$SITE_DIR")"
SITE_ABS="$(cd "$(dirname "$SITE_DIR")" && pwd)/$(basename "$SITE_DIR")"
case "$SITE_ABS/" in
  "$NOTES_ABS/"*)
    echo "Error: --site-dir ($SITE_ABS) is inside --notes-dir ($NOTES_ABS)." >&2
    echo "       Quartz would watch its own install via the content/ symlink → EMFILE." >&2
    echo "       Use separate trees, e.g. --notes-dir .understand/notes --site-dir .understand/quartz" >&2
    exit 1 ;;
esac
case "$NOTES_ABS/" in
  "$SITE_ABS/"*)
    echo "Error: --notes-dir ($NOTES_ABS) is inside --site-dir ($SITE_ABS) — use separate trees." >&2
    exit 1 ;;
esac

if [ -e "$SITE_DIR" ]; then
  if [ "$REUSE" = "1" ]; then
    echo "==> Reusing existing Quartz site at $SITE_DIR (skipping clone + install)"
  else
    echo "Error: --site-dir already exists: $SITE_DIR" >&2
    echo "       Pass --reuse to re-point this existing Quartz site at your notes," >&2
    echo "       or choose a different --site-dir." >&2
    exit 1
  fi
else
  echo "==> Cloning Quartz into $SITE_DIR"
  if [ -n "$QUARTZ_VERSION" ]; then
    git clone --depth 1 --branch "$QUARTZ_VERSION" "$QUARTZ_REPO" "$SITE_DIR"
  else
    git clone --depth 1 "$QUARTZ_REPO" "$SITE_DIR"
  fi
  echo "==> Installing Quartz dependencies"
  ( cd "$SITE_DIR" && npm install )
fi

# Print exactly what we got, and branch on the major version (v4 vs v5 'create' differ).
QV="$(node -p "require('$SITE_DIR/package.json').version" 2>/dev/null || echo unknown)"
QV_MAJOR="$(node -p "require('$SITE_DIR/package.json').version.split('.')[0]" 2>/dev/null || echo 4)"
echo "==> Quartz version: $QV (major $QV_MAJOR)"

echo "==> Pointing Quartz content/ at your notes ($NOTES_ABS)"
if [ "$QV_MAJOR" -ge 5 ] 2>/dev/null; then
  echo "    NOTE: Quartz v$QV_MAJOR detected — this bootstrap targets v4. Attempting best-effort v5 setup." >&2
  echo "    (v5 'create' also needs -t/--template and -b/--baseUrl, and moves wikilinks/graph to plugins.)" >&2
  ( cd "$SITE_DIR" && npx quartz create -X symlink -s "$NOTES_ABS" -l shortest -t default -b "$QUARTZ_BASE_URL" )
  echo "==> Installing Quartz v5 community plugins (wikilinks / graph / backlinks)"
  ( cd "$SITE_DIR" && npx quartz plugin install --from-config ) \
    || echo "    plugin install failed — wikilinks/graph may not render; see references/quartz-setup.md" >&2
else
  # Quartz v4: -X symlink (content/ -> notes), -s source dir, -l shortest link resolution.
  ( cd "$SITE_DIR" && npx quartz create -X symlink -s "$NOTES_ABS" -l shortest )
fi

cat <<EOF

Done. Next steps — build once, then serve the static output (no file-watcher, most reliable):

  cd "$SITE_DIR"
  npx quartz build                 # writes the static site to ./public
  npx serve public                 # or: (cd public && python3 -m http.server 8080)
  # open the printed URL (default http://localhost:8080)

Live-editing the notes? Use the watch server instead:  npx quartz build --serve
  (on macOS, watching a large or misplaced content tree can hit "EMFILE: too many open files" —
   keep the notes dir small and OUTSIDE this site dir; see references/quartz-setup.md.)

To deploy later:  npx quartz sync

If this site dir lives inside a tracked repo, gitignore the build output:
  public/
  .quartz-cache/
EOF
