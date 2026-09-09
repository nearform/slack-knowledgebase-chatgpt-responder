---
name: test-unit-guidelines
description: Use this skill when writing, reviewing, refactoring, or maintaining unit tests in any framework — the isolated, in-process tests of a single function, class, or module. Covers AAA structure, behaviour-focused naming, isolation, mocking discipline, error and async assertions, parametrised cases, and meaningful coverage. Not for integration, contract, or end-to-end tests, which exercise real collaborators.
metadata:
  author: Jacopo Martinelli & Sherrylene Gauci
  version: 1.0.0
  tags:
    - category/test-automation
    - domain/engineering
    - domain/testing
  compatibility:
    - all
---

You are a software engineer ensuring the unit tests you write are behaviour-focused, isolated, and disciplined about test doubles.

Use this skill when working with **unit tests** — the fast, isolated tests that cover a single unit of behaviour (a function, class, or module) apart from its slow or non-deterministic collaborators.

**Reach for a unit test whenever the behaviour can be exercised without a real network, database, browser, filesystem, or clock.**

Three symptoms tell you a unit test is doing its job, and each failure points at its own cause:

- **It runs in milliseconds.** Slower means a real collaborator crept in — find it and replace it at the boundary.
- **It gives the same answer on every run, in any order.** If it doesn't, something uncontrolled leaked in: usually the clock, randomness, or state shared with a neighbouring test.
- **Its name alone tells you what broke.** If a failure sends you to the debugger to find out what happened, the test is covering more than one behaviour — split it.

## Scope

This skill owns the **discipline** of unit testing — how a test is structured, named, isolated, and what it should assert. Framework mechanics (mocking APIs, fake timers, parametrisation syntax) belong to a framework-specific skill such as `test-vitest`.

**Unit tests only.** Do not apply these rules to integration, contract, or end-to-end tests. Those exercise real collaborators — a live database, a browser, the HTTP stack — and these rules would mislead there: mocking every boundary would leave nothing under test, and nothing here covers the DOM, selectors, or page state that those layers turn on. If the behaviour needs a real collaborator to appear, stop and use the skill for that layer.

---

## Core Rules

### Arrange–Act–Assert

Every test has three visible phases: set up the inputs (**Arrange**), invoke the unit once (**Act**), then assert on the result (**Assert**). One action per test.

```javascript
it("takes 10% off orders over 100", () => {
  const order = { total: 200 };        // Arrange
  const result = applyDiscount(order); // Act
  expect(result.total).toBe(180);      // Assert
});
```

### One reason to fail

A test names a single behaviour and asserts it. Multiple unrelated assertions in one test make a failure ambiguous — you can't tell what broke from the test name. If the name needs "and", split the test.

### Name the behaviour, not the function

The `describe`/`it` pair should read as a sentence describing observable behaviour: `describe("applyDiscount")` → `it("takes 10% off orders over 100")`. Avoid names that restate the code (`it("calls computeRate")`) or that are vague (`it("works")`).

### Test behaviour, not implementation

Assert on the unit's observable output — its return value, thrown errors, or the messages it sends to its collaborators. Never assert on private internals or on how the result was computed. Tests coupled to implementation break on every refactor even when behaviour is unchanged.

Whether asserting **that a collaborator was called** is fair depends on which way the call runs. A message the unit sends *out* to a true external boundary — an email sender, a queue, a payment gateway — *is* the observable behaviour, so assert it on the mocked boundary. A value the unit reads *in* — a rate provider, a config lookup, a private helper — is only a means to the outcome; assert the outcome instead.

### Keep tests independent

Each test creates its own data and shares **nothing** mutable with its neighbours — no module-level state reassigned across tests, no reliance on execution order. A test must pass in isolation, and pass when the suite is run in any order.

### Keep tests deterministic

The same input produces the same result every time. Anything non-deterministic — the clock, randomness, the environment, the filesystem — must be controlled, never observed live. Never reach for a fixed delay; at the unit level there is nothing to wait for that you cannot control directly.

---

## Test Doubles & Mocking

Mocking is the easiest thing in unit testing to overdo. The rule: **mock the boundary, not the logic.**

- **Only mock what you don't own or can't control.** The network, the filesystem, the database, the clock, randomness — replace those. Use the real thing for everything else. Mock your own logic and all you have proved is that your mock works.
- **Use the lightest stand-in that does the job.** A plain stub for a dependency you pass in. A spy when you need to watch calls on something real. Replacing a whole module only when the whole module is a boundary. Never start with the heaviest option.
- **Put everything back.** Every spy, mock, and frozen clock must be undone when the test ends, or it leaks into the tests that follow. Spies and mocks can be handled once in config; a frozen clock cannot — no mock-reset setting releases it, so release the clock per file in `afterEach`.
- **If you are mocking a lot, the design is the problem.** When mock setup is most of the test, the unit depends on too much. Change the design — do not add more mocks.

---

## Async & Errors

- Await the unit and assert on the resolved value; never leave a floating promise.
- Assert rejections directly, not via a `try`/`catch` whose assertion may never run.
- When assertions live inside a callback, guard with an expected-assertion count so a silently skipped assertion still fails the test.

---

## Parametrise repetition

When the **behaviour is identical** and only the **data** varies, use the framework's table syntax instead of copy-pasting tests. Do not use it to merge different behaviours — branching inside a parametrised test means it is testing more than one thing. Include the boundary rows either side of a threshold.

---

## Coverage that means something

Coverage measures which lines ran, not whether behaviour is correct. Chase **branches and edge cases** — boundaries, empty inputs, error paths — not a 100% number. A green coverage report over assertion-free tests is worthless.

---

## When NOT to write a unit test

- **Behaviour that only emerges from real collaborators** — a query against a real database, a route through the HTTP stack. That's an integration or contract test; mocking every boundary would only test the mocks.
- **User-visible flows across the whole app** — that's end-to-end territory.
- **Trivial code with no logic** — a one-line getter or a pure re-export earns nothing from a test.

---

## Principles reference

For worked good/bad examples of the rules above, see `references/principles.md`.

---

## Anti-Patterns

- Multiple actions or unrelated assertions in one test
- Asserting on private internals, or that a helper "was called", instead of on the outcome
- Mocking the unit under test or pure logic you own
- Leaving spies, mocks, or fake clocks unrestored between tests
- Shared mutable state or order-dependent tests
- Live clocks or unseeded randomness in assertions
- Floating promises / unawaited async assertions
- Asserting a thrown error without wrapping the call, so it escapes the matcher
- Assertions inside a callback with no expected-assertion count to prove they ran
- Parametrised tables that branch on a case field, merging behaviours
- Test names that restate the code (`it("calls x")`) or say nothing (`it("works")`)
- Chasing a coverage percentage with assertion-free tests

---

## Review Checklist

- Keep one action per test, with a name that tells you what broke.
- Assert an observable outcome, never a private step.
- Build fresh data per test; share nothing mutable.
- Mock only real boundaries.
- Restore every spy, mock, and clock afterwards.
- Await every async assertion, and assert throws and rejections through the matcher.
- Vary only data in a parametrised table; never branch on a case field.
- Cover branches and edge cases, not just the happy path.

---

## Usage

Where a framework-specific unit testing skill exists — `test-vitest`, for example — apply it alongside this one. This skill stands on its own otherwise.
