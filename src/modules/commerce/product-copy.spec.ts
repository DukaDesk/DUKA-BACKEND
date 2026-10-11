import { assertProductCopy } from './commerce.service';

describe('assertProductCopy', () => {
  it('accepts copy within limits', () => {
    expect(() => assertProductCopy('a'.repeat(800), 'b'.repeat(100))).not.toThrow();
    expect(() => assertProductCopy(undefined, undefined)).not.toThrow();
  });

  it('rejects over-long descriptions', () => {
    expect(() => assertProductCopy('a'.repeat(801))).toThrow(/800/);
    expect(() => assertProductCopy('ok', 'b'.repeat(101))).toThrow(/100/);
  });
});
