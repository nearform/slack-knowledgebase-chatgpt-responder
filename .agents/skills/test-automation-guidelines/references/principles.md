# Testing Principles Reference

## Determinism

A deterministic test produces the same result every time given the same inputs.

### Good

- Wait for API response
- Assert DOM state

### Bad

- Fixed delays
- Timing assumptions

---

## Independence

Each test must run in isolation.

### Good

- Fresh data per test
- Independent setup

### Bad

- Reusing state from previous tests

---

## Behaviour vs Implementation

### Good

- "User sees success message"

### Bad

- "Function X was called"

---

## Selector Strategy

### Preferred

- data-testid
- accessibility roles

### Avoid

- CSS classes
- DOM structure
