// Minimal Vitest-style `expect` for node:test, used by tests ported from
// smallwei0301/vibeaico-admin-rebuild (scripts/agents scorecard suites).
// Only the matchers those suites use are implemented; extend deliberately.
import assert from 'node:assert/strict';
import { format } from 'node:util';
import { it } from 'node:test';

class ArrayContaining {
  constructor(items) {
    this.items = items;
  }

  matches(actual) {
    return Array.isArray(actual) && this.items.every((item) => actual.some((entry) => {
      try { assert.deepStrictEqual(stripUndefined(entry), stripUndefined(item)); return true; } catch { return false; }
    }));
  }
}

function stripUndefined(value) {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, stripUndefined(item)]),
    );
  }
  return value;
}

function isSubset(actual, expected) {
  if (expected instanceof RegExp) return typeof actual === 'string' && expected.test(actual);
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && actual.length === expected.length && expected.every((item, index) => isSubset(actual[index], item));
  }
  if (expected && typeof expected === 'object') {
    return Boolean(actual) && typeof actual === 'object' && Object.keys(expected).every((key) => isSubset(actual[key], expected[key]));
  }
  return Object.is(actual, expected);
}

function contains(actual, item) {
  if (typeof actual === 'string') return actual.includes(item);
  if (Array.isArray(actual)) return actual.includes(item);
  throw new TypeError(`toContain expects a string or array, received ${typeof actual}`);
}

function thrownBy(fn) {
  try {
    fn();
  } catch (error) {
    return { threw: true, error };
  }
  return { threw: false };
}

function throwMatches(error, expected) {
  if (expected === undefined) return true;
  const message = error instanceof Error ? error.message : String(error);
  if (expected instanceof RegExp) return expected.test(message);
  if (typeof expected === 'string') return message.includes(expected);
  if (typeof expected === 'function') return error instanceof expected;
  throw new TypeError('toThrow expects a RegExp, string or error class');
}

function matchers(actual, negate) {
  const check = (pass, message) => {
    if (pass === negate) assert.fail(`${negate ? 'not.' : ''}${message}`);
  };
  return {
    toBe(expected) {
      if (!negate) return assert.ok(Object.is(actual, expected), `toBe: expected ${String(expected)}, received ${String(actual)}`);
      check(Object.is(actual, expected), `toBe(${String(expected)})`);
    },
    toEqual(expected) {
      if (expected instanceof ArrayContaining) return check(expected.matches(actual), `toEqual(arrayContaining(${JSON.stringify(expected.items)})) on ${JSON.stringify(actual)}`);
      if (!negate) return assert.deepStrictEqual(stripUndefined(actual), stripUndefined(expected));
      let equal = true;
      try { assert.deepStrictEqual(stripUndefined(actual), stripUndefined(expected)); } catch { equal = false; }
      check(equal, 'toEqual');
    },
    toContain(item) {
      check(contains(actual, item), `toContain(${JSON.stringify(item)}) on ${JSON.stringify(actual)}`);
    },
    toMatch(pattern) {
      const pass = typeof actual === 'string' && (pattern instanceof RegExp ? pattern.test(actual) : actual.includes(pattern));
      check(pass, `toMatch(${String(pattern)}) on ${JSON.stringify(actual)}`);
    },
    toMatchObject(expected) {
      check(isSubset(actual, expected), `toMatchObject(${JSON.stringify(expected)}) on ${JSON.stringify(actual)}`);
    },
    toBeNull() {
      check(actual === null, `toBeNull on ${JSON.stringify(actual)}`);
    },
    toBeUndefined() {
      check(actual === undefined, `toBeUndefined on ${JSON.stringify(actual)}`);
    },
    toBeDefined() {
      check(actual !== undefined, 'toBeDefined');
    },
    toBeGreaterThanOrEqual(expected) {
      check(actual >= expected, `toBeGreaterThanOrEqual(${expected}) on ${actual}`);
    },
    toThrow(expected) {
      if (typeof actual !== 'function') throw new TypeError('toThrow expects a function');
      const result = thrownBy(actual);
      const pass = result.threw && throwMatches(result.error, expected);
      const detail = result.threw ? (result.error instanceof Error ? result.error.message : String(result.error)) : 'nothing thrown';
      check(pass, `toThrow(${String(expected ?? '')}): ${detail}`);
    },
  };
}

export function expect(actual) {
  return Object.assign(matchers(actual, false), { not: matchers(actual, true) });
}

expect.arrayContaining = (items) => new ArrayContaining(items);
expect.unreachable = (message = 'expected code to be unreachable') => assert.fail(message);

// Vitest `it.each(cases)(name, fn)`; `%j`/`%s` in the name are filled from each case.
export function itEach(cases) {
  return (name, fn) => {
    for (const testCase of cases) {
      const args = Array.isArray(testCase) ? testCase : [testCase];
      it(format(name, ...args), () => fn(...args));
    }
  };
}
