import { CODE_ALPHABET, codeFromBytes, inviteUrl, normalizeCode, pairId } from '../lib/friend-codes';

describe('friend codes', () => {
  it('builds codes only from unambiguous characters', () => {
    const code = codeFromBytes(new Uint8Array([0, 30, 31, 255, 128, 7, 9, 100, 200, 61]));
    expect(code).toHaveLength(10);
    for (const ch of code) expect(CODE_ALPHABET).toContain(ch);
    expect(CODE_ALPHABET).not.toMatch(/[01OIL]/);
  });

  it('normalizes typed or pasted codes', () => {
    expect(normalizeCode(' abcd-234 xyz ')).toBe('ABCD234XYZ');
  });

  it('pair ids are order-independent', () => {
    expect(pairId('b', 'a')).toEqual({ id: 'a_b', memberIds: ['a', 'b'] });
    expect(pairId('a', 'b')).toEqual(pairId('b', 'a'));
  });

  it('links to the web invite page', () => {
    expect(inviteUrl('ABCD234XYZ')).toBe('https://www.waldgrave.com/escapefromhadesirl/friend/ABCD234XYZ');
  });
});
