@AGENTS.md

## Claude Code setup note

This repo vendors agent skills into `.agents/skills/`, with `.claude/skills` symlinked to
it. After cloning or pulling a change that adds or updates a skill, **restart Claude Code
(or start a new session)** so project skills are discoverable by name. Until then you can
still read a skill's instructions directly from `.agents/skills/<name>/SKILL.md`.

On Windows the committed symlinks need `git config --global core.symlinks true` plus
Developer Mode, then a re-checkout. macOS and Linux need nothing.
