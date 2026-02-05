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
  const tagSectionLen = dec.words.length - 7 - 104;
  if (tagSectionLen <= 0) {
    return { ok: false, error: `missing tagged fields (words=${dec.words.length})` };
  }

  // Minimal validation that the tagged field section is structurally sound (type + length + data).
  // This is still not a full BOLT11 decoder, but it catches a surprising number of "looks like bech32" fakes.
  const tagWords = dec.words.slice(7, dec.words.length - 104);
  const parsed = parseBolt11TaggedFields(tagWords);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  // Per BOLT11, invoices MUST include a payment_hash ('p') field.
  const paymentHashTags = parsed.tags.filter((t) => t.type === 'p');
  if (paymentHashTags.length === 0) {
    return { ok: false, error: `missing required tagged field 'p' (payment_hash)` };
  }

  // 'p' is 256-bit payment_hash; encoded as 52x 5-bit words.
  // (This is a lightweight sanity check; not a full BOLT11 decoder.)
  if (!paymentHashTags.some((t) => t.len === 52)) {
    const lens = paymentHashTags.map((t) => t.len).join(',');
    return { ok: false, error: `invalid 'p' tagged field length (expected 52 words, got ${lens || 'none'})` };
  }

  return { ok: true, hrp: hrpParsed.hrp };
}

const BECH32_ALPHABET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function parseBolt11TaggedFields(
  words: number[]
): { ok: true; tags: Array<{ type: string; len: number }> } | { ok: false; error: string } {
  // Tagged field grammar (words are 5-bit values):
  //   type (1 word)
  //   data_length (2 words, 10-bit big-endian, length in words)
  //   data (data_length words)
  const tags: Array<{ type: string; len: number }> = [];

  let i = 0;
  while (i < words.length) {
    if (i + 3 > words.length) {
      return { ok: false, error: `truncated tagged field header (i=${i}, words=${words.length})` };
    }

    const t = words[i] ?? 0;
    const tChar = BECH32_ALPHABET[t] ?? '?';

    const len = ((words[i + 1] ?? 0) << 5) | (words[i + 2] ?? 0);
    i += 3;

    if (len < 0) return { ok: false, error: `invalid tagged field length (len=${len})` };
    if (i + len > words.length) {
      return { ok: false, error: `tagged field overruns section (type=${tChar}, len=${len}, i=${i}, words=${words.length})` };
    }

    tags.push({ type: tChar, len });
    i += len;
  }

  return { ok: true, tags };
}
