# Unit Testing Principles Reference

Worked good/bad examples for the rules in `SKILL.md`. Syntax is illustrative:
`describe`/`it`/`afterEach` and `expect` with its matchers (`toBe`,
`toHaveBeenCalledWith`, …) are near-universal, and every other API below is a
neutral placeholder — `mockModule`, `stub`, `spyOn`, `useFakeClock`,
`advanceClockBy`, `useRealClock`, `forEachCase`, `expectRejection`. None is a
real global; substitute your framework's equivalents (`spyOn`, for instance, is
`vi.spyOn` in Vitest and `jest.spyOn` in Jest). See `test-vitest` for the Vitest
forms.

## Arrange–Act–Assert

### Good — three clear phases, one action

```javascript
it("takes 10% off orders over 100", () => {
  const order = { total: 200 };        // Arrange
  const result = applyDiscount(order); // Act
  expect(result.total).toBe(180);      // Assert
});
```

### Bad — two actions, ambiguous failure

```javascript
it("discounts and formats", () => {
  const result = applyDiscount({ total: 200 });
  expect(result.total).toBe(180);
  const label = formatPrice(result); // second action — separate behaviour
  expect(label).toBe("£180.00");
});
```

---

## Naming

### Good — reads as observable behaviour

- `applyDiscount` → `takes 10% off orders over 100`
- `loadProfile` → `rejects an unknown user`

### Bad — restates the code, or says nothing

- `calls computeRate`
- `works`
- `test 1`

---

## Behaviour vs Implementation

### Good — asserts the observable outcome

```javascript
it("returns the discounted total", () => {
  expect(applyDiscount({ total: 200 }).total).toBe(180);
});
```

### Good — a message to a real boundary IS the behaviour

```javascript
it("emails the customer when the order ships", () => {
  markShipped(order);
  expect(emailService.send).toHaveBeenCalledWith(order.email, "shipped");
});
```

### Bad — asserts how it was computed

```javascript
it("computes the rate", () => {
  const getRate = stub(0.9); // a collaborator it reads a value FROM
  applyDiscount({ total: 200 }, getRate);
  expect(getRate).toHaveBeenCalled(); // green even if the total came out wrong
});
```

---

## Isolation & Shared State

### Good — each test builds its own data

```javascript
function makeOrder(overrides = {}) {
  return { total: 200, ...overrides };
}

it("discounts a large order", () => {
  expect(applyDiscount(makeOrder()).total).toBe(180);
});

it("leaves a small order alone", () => {
  expect(applyDiscount(makeOrder({ total: 50 })).total).toBe(50);
});
```

### Bad — mutable state shared across tests

```javascript
let order = { total: 50 }; // one object, shared by every test

it("discounts a large order", () => {
  order.total = 200; // leaves 200 behind for whatever runs next
  expect(applyDiscount(order).total).toBe(180);
});

it("leaves a small order alone", () => {
  // order.total is 200 by now, not 50 — this test fails because of its neighbour
  expect(applyDiscount(order).total).toBe(50);
});
```

---

## Time & Randomness

### Good — control the clock, then restore it

```javascript
afterEach(() => {
  useRealClock(); // runs even when an assertion throws
});

it("expires the token after one hour", () => {
  useFakeClock("2026-01-01T00:00:00Z");

  const token = issueToken();
  advanceClockBy(60 * 60 * 1000);

  expect(isExpired(token)).toBe(true);
});
```

### Bad — asserts against a live clock

```javascript
it("expires the token", async () => {
  const token = issueToken();
  await new Promise((r) => setTimeout(r, 3_600_000)); // slow + flaky
  expect(isExpired(token)).toBe(true);
});
```

---

## Mocking Discipline

### Good — mock only the external boundary

```javascript
mockModule("./httpClient", { fetchRates: stub({ usd: 1.5 }) });

it("converts using the live rate", async () => {
  expect(await toUsd(100)).toBe(150);
});
```

### Bad — mocking the logic under test

```javascript
mockModule("./pricing", { applyDiscount: stub({ total: 180 }) });

it("applies a discount", () => {
  expect(applyDiscount({ total: 200 }).total).toBe(180); // asserts the stub, not the code
});
```

---

## Errors

### Good — wrap the call so the matcher can catch the throw

```javascript
it("rejects an order with no total", () => {
  expect(() => validateOrder({})).toThrow(TypeError);
});
```

### Bad — the call runs before the matcher wraps it

```javascript
it("rejects an order with no total", () => {
  expect(validateOrder({})).toThrow(TypeError); // throws straight out of the test
});
```

### Good — assert the rejection directly

```javascript
it("rejects an unknown user", async () => {
  await expectRejection(loadProfile("nobody"), "not found");
});
```

### Bad — a catch that may never run

```javascript
it("rejects an unknown user", async () => {
  try {
    await loadProfile("nobody");
  } catch (e) {
    expect(e.message).toBe("not found"); // silently skipped if it resolves
  }
});
```

---

## Parametrisation

### Good — same behaviour, varying data

```javascript
forEachCase(
  [
    { total: 50, expected: 50 },   // below the threshold — untouched
    { total: 100, expected: 100 }, // exactly 100 — not "over", untouched
    { total: 200, expected: 180 }, // over 100 — 10% off
  ],
  ({ total, expected }) => {
    expect(applyDiscount({ total }).total).toBe(expected);
  }
);
```

### Bad — different behaviours forced into one table

```javascript
forEachCase(
  [
    { total: 200, action: "discount", expected: 180 },
    { total: 0, action: "reject", expected: "empty order" },
  ],
  ({ total, action, expected }) => {
    // branching on `action` means two behaviours in one test
  }
);
```

---

## Coverage

### Good — targets branches and edges

- Boundary values either side of a threshold
- Empty and single-element inputs
- Every error path the unit can take

### Bad — targets a number

- Assertion-free tests that execute lines to lift the percentage
- A 100% target treated as proof of correctness

---

The review checklist for these principles lives in `SKILL.md`.
