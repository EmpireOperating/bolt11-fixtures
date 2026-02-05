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

  // BOLT11 HRP is: ln + currency-prefix + optional amount.
  // Common currency prefixes: bc (mainnet), tb (testnet), bcrt (regtest), tbs (signet).
  // We keep this strict enough to reject unrelated bech32 strings.
  if (!/^ln(?:bc|tb|bcrt|tbs)[0-9]*[munp]?$/.test(hrp)) {
    return { ok: false, error: `unexpected hrp for BOLT11 (hrp=${hrp})` };
  }

  // Data part must be long enough to contain:
  // - 35-bit timestamp (7x 5-bit words)
  // - 65-byte signature (520 bits = 104x 5-bit words)
  // plus some tagged fields.
  //
  // This is not a full BOLT11 decoder, but it rejects obviously-too-short strings.
  const minWords = 7 + 104;
  if (dec.words.length < minWords) {
    return { ok: false, error: `data part too short for BOLT11 (words=${dec.words.length}, min=${minWords})` };
  }

  return { ok: true, hrp };
}
