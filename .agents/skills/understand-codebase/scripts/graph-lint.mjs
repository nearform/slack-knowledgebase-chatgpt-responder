#!/usr/bin/env node
//
// graph-lint.mjs — opt-in linter for the understand-codebase skill.
//
// Zero-dependency ESM. Parses a knowledge base of markdown notes, builds the [[wikilink]] graph,
// and reports defects to stdout. Read-only by default — it NEVER rewrites notes unless you pass
// --fix-backlinks, which only appends a "## Referenced by" section.
//
// Usage:
//   node graph-lint.mjs --notes-dir <path> [--git-dir <repo>] [--json] [--stale-only] [--fix-backlinks]
//
// Checks: dead links, ambiguous links (a basename that exists in >1 folder), orphans, frontmatter
// validity, and (with --git-dir) stale notes plus notes that name source files but lack a source_commit.
//
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, relative, basename, extname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

// ---- args -------------------------------------------------------------------
const args = process.argv.slice(2);
function flag(name) { return args.includes(name); }
function opt(name) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; }

const notesDir = opt('--notes-dir');
const gitDir = opt('--git-dir');
const asJson = flag('--json');
const staleOnly = flag('--stale-only');
const fixBacklinks = flag('--fix-backlinks');

if (!notesDir) {
  console.error('Error: --notes-dir is required.\nUsage: node graph-lint.mjs --notes-dir <path> [--git-dir <repo>] [--json] [--stale-only] [--fix-backlinks]');
  process.exit(2);
}

const VALID_TYPES = new Set(['concept', 'module', 'architecture', 'domain', 'tour', 'source']);
const LINK_RE = /\[\[([^\]]+)\]\]/g;

// ---- helpers ----------------------------------------------------------------
async function walk(dir) {
  const out = [];
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); }
  catch { return out; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (['.git', 'node_modules', 'public', '.quartz-cache'].includes(e.name)) continue;
      out.push(...await walk(p));
    } else if (extname(e.name) === '.md') {
      out.push(p);
    }
  }
  return out;
}

// Minimal frontmatter parser: handles scalars and simple `- item` lists. No external deps.
function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const fm = {};
  let key = null;
  for (const raw of m[1].split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) continue;
    const listItem = line.match(/^\s*-\s+(.*)$/);
    if (listItem && key) {
      (fm[key] = Array.isArray(fm[key]) ? fm[key] : []).push(unquote(listItem[1]));
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (kv) {
      key = kv[1];
      const val = kv[2];
      if (val === '') { fm[key] = []; }            // likely a block list follows
      else if (val.startsWith('[')) {              // inline list [a, b]
        fm[key] = val.slice(1, -1).split(',').map(s => unquote(s.trim())).filter(Boolean);
      } else { fm[key] = unquote(val); }
    }
  }
  return fm;
}
function unquote(s) { return s.replace(/^["']|["']$/g, ''); }

// Resolve a [[link]] (strip display alias and #heading) to a note key.
function linkTarget(link) {
  return link.split('|')[0].split('#')[0].trim();
}

async function gitChangedSince(repo, commit, paths) {
  // Returns true if any of `paths` has a commit after `commit`.
  if (!commit || !paths || paths.length === 0) return false;
  try {
    const { stdout } = await execFileP(
      'git', ['-C', repo, 'log', '--oneline', `${commit}..HEAD`, '--', ...paths],
      { maxBuffer: 1024 * 1024 }
    );
    return stdout.trim().length > 0;
  } catch {
    return false; // commit unknown / path gone — don't crash the lint
  }
}

// ---- main -------------------------------------------------------------------
const files = await walk(notesDir);
if (files.length === 0) {
  console.error(`No .md notes found under ${notesDir}`);
  process.exit(1);
}

// Index notes by relative-path-without-ext and by basename for shortest-path link resolution.
const notes = [];
const byRel = new Map();
const byBase = new Map();
for (const file of files) {
  const text = await readFile(file, 'utf8');
  const rel = relative(notesDir, file).replace(/\.md$/, '');
  const base = basename(file, '.md');
  const fm = parseFrontmatter(text);
  // Strip fenced/inline code so example [[links]] in code samples aren't treated as real edges.
  const prose = text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  const links = [...prose.matchAll(LINK_RE)].map(m => linkTarget(m[1]));
  const note = { file, rel, base, fm, links, text };
  notes.push(note);
  byRel.set(rel, note);
  if (!byBase.has(base)) byBase.set(base, note); else byBase.set(base, 'AMBIGUOUS');
}

function resolve(target) {
  const t = target.replace(/\.md$/, '');
  if (byRel.has(t)) return byRel.get(t);
  const b = byBase.get(basename(t));
  if (b === 'AMBIGUOUS') return 'AMBIGUOUS';
  if (b) return b;
  return null;
}

const deadLinks = [];
const ambiguousLinks = [];
const backlinks = new Map(); // note.rel -> Set of source rels
for (const n of notes) backlinks.set(n.rel, new Set());

for (const n of notes) {
  for (const target of n.links) {
    const dest = resolve(target);
    if (dest === 'AMBIGUOUS') {
      ambiguousLinks.push({ from: n.rel, target });
    } else if (!dest) {
      deadLinks.push({ from: n.rel, target });
    } else if (dest.rel !== n.rel) {
      backlinks.get(dest.rel).add(n.rel);
    }
  }
}

const orphans = notes
  .filter(n => basename(n.base) !== 'index')
  .filter(n => backlinks.get(n.rel).size === 0)
  .map(n => n.rel);

const badFrontmatter = notes
  .filter(n => !n.fm.title || (n.fm.type && !VALID_TYPES.has(n.fm.type)))
  .map(n => ({ note: n.rel, title: n.fm.title ?? null, type: n.fm.type ?? null }));

let stale = [];
const missingProvenance = [];
if (gitDir) {
  for (const n of notes) {
    const paths = Array.isArray(n.fm.source_paths) ? n.fm.source_paths
      : n.fm.source_paths ? [n.fm.source_paths] : [];
    // A note that names source files but has no source_commit can't be staleness-checked — flag it
    // rather than silently treating it as fresh.
    if (paths.length > 0 && !n.fm.source_commit) {
      missingProvenance.push({ note: n.rel, source_paths: paths });
      continue;
    }
    if (await gitChangedSince(gitDir, n.fm.source_commit, paths)) {
      stale.push({ note: n.rel, source_commit: n.fm.source_commit, source_paths: paths });
    }
  }
}

// ---- optional: materialise backlinks ---------------------------------------
let fixed = 0;
if (fixBacklinks) {
  for (const n of notes) {
    const refs = [...backlinks.get(n.rel)].sort();
    if (refs.length === 0) continue;
    const section = `\n\n## Referenced by\n\n${refs.map(r => `- [[${basename(r)}]]`).join('\n')}\n`;
    // Replace only our own block (stop at the next heading or EOF) so trailing content is preserved.
    let body = n.text.replace(/\n+## Referenced by\n[\s\S]*?(?=\n## |$)/, '\n');
    body = body.replace(/\s+$/, '') + section;
    if (body !== n.text) { await writeFile(n.file, body); fixed++; }
  }
}

// ---- report -----------------------------------------------------------------
const report = {
  notesDir,
  totalNotes: notes.length,
  deadLinks,
  ambiguousLinks,
  orphans,
  badFrontmatter,
  stale,
  missingProvenance,
  ...(fixBacklinks ? { backlinksWritten: fixed } : {}),
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else if (staleOnly) {
  if (stale.length === 0) console.log('✓ No stale notes.');
  else { console.log(`⚠ ${stale.length} possibly-stale note(s):`); stale.forEach(s => console.log(`  - ${s.note} (source_commit ${s.source_commit})`)); }
} else {
  const line = (label, n) => console.log(`${n === 0 ? '✓' : '⚠'} ${label}: ${n}`);
  console.log(`Knowledge base: ${notesDir}  (${notes.length} notes)`);
  line('Dead links', deadLinks.length);
  deadLinks.forEach(d => console.log(`    ${d.from} → [[${d.target}]]  (no such note)`));
  line('Ambiguous links (basename in >1 folder)', ambiguousLinks.length);
  ambiguousLinks.forEach(d => console.log(`    ${d.from} → [[${d.target}]]  (matches multiple notes — qualify it, e.g. [[folder/${d.target}]])`));
  line('Orphans (no inbound link)', orphans.length);
  orphans.forEach(o => console.log(`    ${o}`));
  line('Frontmatter problems', badFrontmatter.length);
  badFrontmatter.forEach(b => console.log(`    ${b.note}  (title=${b.title}, type=${b.type})`));
  if (gitDir) {
    line('Stale notes', stale.length); stale.forEach(s => console.log(`    ${s.note}`));
    line('Notes missing source_commit', missingProvenance.length); missingProvenance.forEach(m => console.log(`    ${m.note}`));
  } else console.log('• Stale check skipped (pass --git-dir <repo> to enable).');
  if (fixBacklinks) console.log(`• Backlink sections written: ${fixed}`);
}

// Exit non-zero only on hard graph defects (dead links / bad frontmatter), so it's CI-friendly
// but never blocks a commit when wired into a post-commit hook (that path uses --stale-only || true).
process.exit(deadLinks.length > 0 || ambiguousLinks.length > 0 || badFrontmatter.length > 0 ? 1 : 0);
