/**
 * Drop leading zeros from a typed number so "04" reads as "4". A single zero
 * before a decimal point stays ("0.5"), and a lone "0" stays "0".
 */
export function stripLeadingZeros(text: string): string {
  return text.replace(/^0+(?=\d)/, '');
}
