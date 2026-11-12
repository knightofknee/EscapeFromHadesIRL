import { stripLeadingZeros } from '@/lib/number-input';

describe('stripLeadingZeros', () => {
  it('replaces the starting zero with the typed digit', () => {
    expect(stripLeadingZeros('04')).toBe('4');
    expect(stripLeadingZeros('012')).toBe('12');
    expect(stripLeadingZeros('007.5')).toBe('7.5');
  });

  it('keeps a real zero', () => {
    expect(stripLeadingZeros('0')).toBe('0');
    expect(stripLeadingZeros('00')).toBe('0');
    expect(stripLeadingZeros('0.5')).toBe('0.5');
    expect(stripLeadingZeros('0.')).toBe('0.');
  });

  it('leaves other values alone', () => {
    expect(stripLeadingZeros('')).toBe('');
    expect(stripLeadingZeros('40')).toBe('40');
    expect(stripLeadingZeros('10.05')).toBe('10.05');
    expect(stripLeadingZeros('.5')).toBe('.5');
  });
});
