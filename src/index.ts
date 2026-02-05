import { bech32 } from 'bech32';

export type DecodeResult =
  | { ok: true; hrp: string; words: number[] }
  | { ok: false; error: string };

export function decodeBech32(s: string): DecodeResult {
  try {
    const { prefix, words } = bech32.decode(String(s), 2000);
    return { ok: true, hrp: prefix, words };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

export function looksLikeBolt11(invoice: string): { ok: true; hrp: string } | { ok: false; error: string } {
  const dec = decodeBech32(invoice);
  if (!dec.ok) return { ok: false, error: `bech32 decode failed: ${dec.error}` };

  const hrp = dec.hrp.toLowerCase();
  if (!hrp.startsWith('ln')) return { ok: false, error: `hrp does not start with ln (hrp=${hrp})` };

  // BOLT11 common HRPs: lnbc, lntb, lnbcrt, lntbs, etc.
  // We keep this permissive: any ln* is allowed, strict mapping can come later.
  return { ok: true, hrp };
}
