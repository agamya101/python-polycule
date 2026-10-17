// GSM-7 basic character set
const GSM7_BASIC_CHARS =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM7_SET = new Set([...GSM7_BASIC_CHARS]);

export function detectEncoding(text: string): 'GSM7' | 'UCS2' {
  for (const ch of [...text]) {
    if (!GSM7_SET.has(ch)) {
      return 'UCS2';
    }
  }
  return 'GSM7';
}

export function charCount(text: string): number {
  return [...text].length;
}

export function segmentCount(text: string, encoding?: 'GSM7' | 'UCS2'): number {
  const enc = encoding ?? detectEncoding(text);
  const n = charCount(text);
  if (n === 0) return 1;
  if (enc === 'GSM7') {
    return n <= 160 ? 1 : Math.ceil(n / 153);
  }
  return n <= 70 ? 1 : Math.ceil(n / 67);
}

export function numbersPreserved(en: string, local: string): boolean {
  const tokens = en.match(/\d+(\.\d+)?/g) ?? [];
  for (const token of tokens) {
    if (!local.includes(token)) {
      return false;
    }
  }
  return true;
}

export function computeSmsMeta(textEnglish: string, textLocal: string): {
  charCount: number;
  segments: number;
  encoding: 'GSM7' | 'UCS2';
  numbersPreserved: boolean;
  warning: string | null;
} {
  const enc = detectEncoding(textLocal);
  const chars = charCount(textLocal);
  const segs = segmentCount(textLocal, enc);
  const preserved = numbersPreserved(textEnglish, textLocal);
  return {
    charCount: chars,
    segments: segs,
    encoding: enc,
    numbersPreserved: preserved,
    warning: preserved ? null : 'Numbers changed in translation — blocked',
  };
}
