/**
 * Korean 두벌식 IME ↔ QWERTY fallback for single-character interactive
 * prompts (approval y/a/n, etc.). When the user forgets to switch off
 * the Korean IME and types ㅛ for y, ㅁ for a, or ㅜ for n, we still
 * want the intended action — not an accidental deny.
 *
 * Only the letters actually used by our prompts are mapped; everything
 * else passes through untouched.
 */
const HANGUL_TO_QWERTY: Record<string, string> = {
  ㅛ: 'y',
  ㅁ: 'a',
  ㅜ: 'n',
};

export function normalizeApprovalChoice(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length !== 1) return trimmed;
  return HANGUL_TO_QWERTY[trimmed] ?? trimmed;
}
