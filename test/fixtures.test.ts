import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { looksLikeBolt11, parseBolt11Hrp } from '../src/index.js';
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

test('parseBolt11Hrp: extracts network + amount components', () => {
  // From BOLT11 examples.
  const a = parseBolt11Hrp('lnbc');
  assert.deepEqual(a, {
    ok: true,
    hrp: 'lnbc',
    currency: 'bc',
    network: 'mainnet',
    amountDigits: undefined,
    multiplier: undefined
  });

  const b = parseBolt11Hrp('lntb20m');
  assert.deepEqual(b, {
    ok: true,
    hrp: 'lntb20m',
    currency: 'tb',
    network: 'testnet',
    amountDigits: '20',
    multiplier: 'm'
  });

  const c = parseBolt11Hrp('lnbc2500u');
  assert.deepEqual(c, {
    ok: true,
    hrp: 'lnbc2500u',
    currency: 'bc',
    network: 'mainnet',
    amountDigits: '2500',
    multiplier: 'u'
  });
});

test('looksLikeBolt11: rejects bech32-encoded ln* strings that are too short', () => {
  // Generate a checksum-valid bech32 string with a lightning-ish HRP but too few data words.
  const tooShort = bech32.encode('lnbc', [0, 1, 2, 3, 4, 5], 2000);
  const r = looksLikeBolt11(tooShort);
  assert.equal(r.ok, false);
  assert.match((r as any).error, /too short/);
});

test('looksLikeBolt11: rejects invoices with no tagged fields (timestamp+sig only)', () => {
  // 7 words timestamp + 104 words signature, but no tagged fields in between.
  const words = new Array(7 + 104).fill(0);
  const synthetic = bech32.encode('lnbc', words, 2000);

  const r = looksLikeBolt11(synthetic);
  assert.equal(r.ok, false);
  assert.match((r as any).error, /tagged fields/);
});

test("looksLikeBolt11: rejects invoices whose tagged fields are structurally invalid (len overruns)", () => {
  // Timestamp (7) + tagged fields + sig (104).
  // Tagged field header says len=10 words but we only provide 1.
  const timestamp = new Array(7).fill(0);
  const tagType = 1; // 'p' in bech32 alphabet.
  const len = 10;
  const tagHeader = [tagType, (len >> 5) & 31, len & 31];
  const tagData = [0];
  const sig = new Array(104).fill(0);

  const synthetic = bech32.encode('lnbc', [...timestamp, ...tagHeader, ...tagData, ...sig], 2000);
  const r = looksLikeBolt11(synthetic);
  assert.equal(r.ok, false);
  assert.match((r as any).error, /overruns|truncated/i);
});

test("looksLikeBolt11: rejects invoices missing required 'p' (payment_hash) tag", () => {
  // Build a structurally-valid tagged field section, but with tag type 'd' instead of 'p'.
  const timestamp = new Array(7).fill(0);
  const tagType = 13; // 'd' in bech32 alphabet.
  const len = 1;
  const tagHeader = [tagType, (len >> 5) & 31, len & 31];
  const tagData = [0];
  const sig = new Array(104).fill(0);

  const synthetic = bech32.encode('lnbc', [...timestamp, ...tagHeader, ...tagData, ...sig], 2000);
  const r = looksLikeBolt11(synthetic);
  assert.equal(r.ok, false);
  assert.match((r as any).error, /missing required.*'p'/i);
});
