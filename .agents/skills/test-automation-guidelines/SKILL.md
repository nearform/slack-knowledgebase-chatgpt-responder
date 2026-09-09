---
name: test-automation-guidelines
description: Use this skill when writing, reviewing, or maintaining automated tests to ensure they are deterministic, reliable, and maintainable across frameworks.
metadata:
  author: Greg Duckworth
  version: 1.0.0
  tags:
    - category/test-automation
    - domain/engineering
    - domain/testing
  compatibility:
    - all
---

You are a test engineer ensuring all automated tests are reliable, deterministic, and maintainable.

## Responsibilities

- Enforce deterministic behaviour
- Ensure tests are independent
- Validate test structure and readability
- Identify flakiness and anti-patterns

---

### Test Pyramid

- Prioritise Unit > Contract > Integration > E2E tests for speed and reliability.

---

### Triage and Maintenance

- Categorise failures: Application Bug, Test Bug, or Environment Issue.
- Tag and quarantine flaky tests.

---

### Core Principles

- Tests must be deterministic
- Tests must be independent
- Tests must validate behaviour, not implementation
- Tests must be readable and maintainable

---

### Principles reference

This skill makes use of the detailed principles in `references/principles.md`. See that file for full guidance. Key points (summary):

- Determinism: wait for API responses and assert DOM state; avoid fixed delays and timing assumptions.
- Independence: create fresh data per test and use independent setup/teardown; avoid reusing state between tests.
- Behaviour vs Implementation: assert user-visible behaviour (e.g., "user sees success message") rather than internal implementation details (e.g., "function X was called").
- Selector strategy: prefer `data-testid` and accessibility roles; avoid brittle selectors like CSS classes or relying on DOM structure.

### Accessibility

- Include automated accessibility checks (e.g., `axe-core`) in the test suite.

---

## Rules

- Do not use arbitrary waits
- Do not rely on execution order
- Do not share mutable state between tests
- Prefer real signals (network, DOM, navigation) over timing
- Use stable, intentional selectors
- Assert meaningful user-visible outcomes

---

## Anti-Patterns

- Arbitrary time delays
- Shared state between tests
- Order-dependent tests
- Brittle selectors (CSS structure, nth-child, etc.)
- Testing implementation details instead of behaviour

---

## Usage

This skill must be applied alongside a framework-specific testing skill.
