/**
 * Simple test to verify Jest setup
 */

describe('Basic Jest setup', () => {
  it('should run basic tests', () => {
    expect(1 + 1).toBe(2);
  });

  it('should handle string operations', () => {
    const str = 'hello world';
    expect(str.toUpperCase()).toBe('HELLO WORLD');
  });
});
