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

export type Bolt11Network = 'mainnet' | 'testnet' | 'regtest' | 'signet';

export type ParseBolt11HrpResult =
  | {
      ok: true;
      hrp: string;
      network: Bolt11Network;
      currency: 'bc' | 'tb' | 'bcrt' | 'tbs';
      amountDigits?: string;
      multiplier?: 'm' | 'u' | 'n' | 'p';
    }
  | { ok: false; error: string };

export function parseBolt11Hrp(hrpInput: string): ParseBolt11HrpResult {
  const hrp = String(hrpInput).toLowerCase();

  // BOLT11 HRP is: ln + currency-prefix + optional amount.
  // Common currency prefixes: bc (mainnet), tb (testnet), bcrt (regtest), tbs (signet).
  //
  // HRP grammar (simplified):
  //   ln + <currency> + [<amountDigits> [<multiplier>]]
  // where multiplier ∈ {m,u,n,p}.
  const m = /^ln(bc|tb|bcrt|tbs)(\d+)?([munp])?$/.exec(hrp);
  if (!m) return { ok: false, error: `unexpected hrp for BOLT11 (hrp=${hrp})` };

  const currency = m[1] as 'bc' | 'tb' | 'bcrt' | 'tbs';
  const amountDigits = m[2];
  const multiplier = m[3] as 'm' | 'u' | 'n' | 'p' | undefined;

  // Multiplier without an amount is invalid (e.g. lnbcu).
  if (multiplier && !amountDigits) {
    return { ok: false, error: `unexpected hrp for BOLT11 (multiplier without amount, hrp=${hrp})` };
  }

  // If amount is present, reject leading zeros and zero amounts.
  // (Full amount/multiplier validation is out of scope here.)
  if (amountDigits) {
    if (amountDigits.length > 1 && amountDigits.startsWith('0')) {
      return { ok: false, error: `unexpected hrp for BOLT11 (leading zeros, hrp=${hrp})` };
    }
    if (amountDigits === '0') {
      return { ok: false, error: `unexpected hrp for BOLT11 (zero amount, hrp=${hrp})` };
    }
  }

  const network: Bolt11Network =
    currency === 'bc' ? 'mainnet' : currency === 'tb' ? 'testnet' : currency === 'bcrt' ? 'regtest' : 'signet';

  return {
    ok: true,
    hrp,
    currency,
    network,
    amountDigits,
    multiplier
  };
}

export function looksLikeBolt11(invoice: string): { ok: true; hrp: string } | { ok: false; error: string } {
  const dec = decodeBech32(invoice);
  if (!dec.ok) return { ok: false, error: `bech32 decode failed: ${dec.error}` };

  const hrpParsed = parseBolt11Hrp(dec.hrp);
  if (!hrpParsed.ok) return hrpParsed;

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

  // There should be at least *some* tagged field data between the timestamp and the signature.
  // In practice, real invoices always include required tags (e.g., payment_hash), so this is a safe
  // extra sanity check to reject synthetic ln* bech32 strings that only have a timestamp+sig.
  const tagWords = dec.words.length - 7 - 104;
  if (tagWords <= 0) {
    return { ok: false, error: `missing tagged fields (words=${dec.words.length})` };
  }

  return { ok: true, hrp: hrpParsed.hrp };
}
