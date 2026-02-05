import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { looksLikeBolt11 } from '../src/index.js';
import { bech32 } from 'bech32';

const fixturesPath = path.join(process.cwd(), 'fixtures', 'bolt11.json');
const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));

test('fixtures: invalid invoices are rejected', () => {
  for (const item of fixtures.invalid) {
    const r = looksLikeBolt11(item.invoice);
    assert.equal(r.ok, false, `expected invalid: ${item.name}`);
  }
});

test('fixtures: valid invoices are expected to pass looksLikeBolt11', () => {
  for (const item of fixtures.valid) {
    const r = looksLikeBolt11(item.invoice);
    assert.equal(r.ok, true, `expected valid: ${item.name} (${(r as any).error || ''})`);
  }
});

test('looksLikeBolt11: rejects bech32-encoded ln* strings that are too short', () => {
  // Generate a checksum-valid bech32 string with a lightning-ish HRP but too few data words.
  const tooShort = bech32.encode('lnbc', [0, 1, 2, 3, 4, 5], 2000);
  const r = looksLikeBolt11(tooShort);
  assert.equal(r.ok, false);
  assert.match((r as any).error, /too short/);
});
