import {
  generateOpaqueToken,
  hashPassword,
  hashToken,
  safeTimingCompare,
  verifyPassword,
} from '../src/common/utils/crypto.util';

describe('Crypto Utilities', () => {
  it('hashes and verifies passwords with Argon2id', async () => {
    const plain = 'SecurePass123!';
    const hashed = await hashPassword(plain);

    expect(hashed.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(hashed, plain)).toBe(true);
    expect(await verifyPassword(hashed, 'WrongPass123!')).toBe(false);
  });

  it('produces deterministic SHA-256 token hashes', () => {
    const token = generateOpaqueToken(32);
    expect(token).toHaveLength(64);
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toBe(token);
  });

  it('compares tokens in constant time', () => {
    expect(safeTimingCompare('abc123', 'abc123')).toBe(true);
    expect(safeTimingCompare('abc123', 'abc124')).toBe(false);
    expect(safeTimingCompare('abc', 'abcd')).toBe(false);
  });
});
