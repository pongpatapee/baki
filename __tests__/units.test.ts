import { displayWeight, formatDuration, parseDecimal, parseDuration, unitToKg } from '@/domain/units';

describe('units', () => {
  it('round-trips lb through kg', () => {
    expect(displayWeight(unitToKg(225, 'lb'), 'lb')).toBe('225');
  });
  it('formats durations', () => {
    expect(formatDuration(75)).toBe('1:15');
    expect(formatDuration(3725)).toBe('1:02:05');
  });
  it('parses user input', () => {
    expect(parseDuration('1:30')).toBe(90);
    expect(parseDuration('abc')).toBeNull();
    expect(parseDecimal('102,5')).toBe(102.5);
    expect(parseDecimal('')).toBeNull();
  });
});
