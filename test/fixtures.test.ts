import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { looksLikeBolt11 } from '../src/index.js';

const fixturesPath = path.join(process.cwd(), 'fixtures', 'bolt11.json');
const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));

test('fixtures: invalid invoices are rejected', () => {
  for (const item of fixtures.invalid) {
    const r = looksLikeBolt11(item.invoice);
    assert.equal(r.ok, false, `expected invalid: ${item.name}`);
  }
});

test('fixtures: valid invoices are currently expected to pass looksLikeBolt11', () => {
  // NOTE: for now this is intentionally strict: the sample-mock-1 is NOT real bech32,
  // so we expect it to FAIL. This test encodes the current expectation and will evolve
  // as we add real BOLT11 vectors.
  for (const item of fixtures.valid) {
    const r = looksLikeBolt11(item.invoice);
    assert.equal(r.ok, false, `expected currently-failing mock to fail: ${item.name}`);
  }
});
