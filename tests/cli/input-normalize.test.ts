import { describe, it, expect } from 'vitest';
import { normalizeApprovalChoice } from '../../src/cli/input-normalize.js';

describe('normalizeApprovalChoice', () => {
  it('passes QWERTY letters through', () => {
    expect(normalizeApprovalChoice('y')).toBe('y');
    expect(normalizeApprovalChoice('a')).toBe('a');
    expect(normalizeApprovalChoice('n')).toBe('n');
  });

  it('lowercases uppercase QWERTY input', () => {
    expect(normalizeApprovalChoice('Y')).toBe('y');
    expect(normalizeApprovalChoice('A')).toBe('a');
  });

  it('trims whitespace', () => {
    expect(normalizeApprovalChoice('  y  ')).toBe('y');
    expect(normalizeApprovalChoice('\ta\n')).toBe('a');
  });

  it('maps ㅛ (Hangul) to y', () => {
    expect(normalizeApprovalChoice('ㅛ')).toBe('y');
  });

  it('maps ㅁ (Hangul) to a', () => {
    expect(normalizeApprovalChoice('ㅁ')).toBe('a');
  });

  it('maps ㅜ (Hangul) to n', () => {
    expect(normalizeApprovalChoice('ㅜ')).toBe('n');
  });

  it('maps trimmed Hangul input', () => {
    expect(normalizeApprovalChoice('  ㅛ  ')).toBe('y');
  });

  it('does not rewrite multi-character Hangul input', () => {
    // Two-char input should pass through — avoids mangling meaningful
    // text that happens to start with one of the mapped jamo.
    expect(normalizeApprovalChoice('ㅛㅛ')).toBe('ㅛㅛ');
  });

  it('passes unrelated single characters through unchanged', () => {
    expect(normalizeApprovalChoice('z')).toBe('z');
    expect(normalizeApprovalChoice('1')).toBe('1');
    expect(normalizeApprovalChoice('ㅎ')).toBe('ㅎ');
  });

  it('returns empty string for empty or whitespace-only input', () => {
    expect(normalizeApprovalChoice('')).toBe('');
    expect(normalizeApprovalChoice('   ')).toBe('');
  });
});
