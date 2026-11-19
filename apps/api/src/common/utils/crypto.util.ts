import * as argon2 from 'argon2';
import * as crypto from 'crypto';

export async function hashPassword(plainPassword: string): Promise<string> {
  return argon2.hash(plainPassword, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
}

export async function verifyPassword(
  passwordHash: string,
  plainPassword: string,
): Promise<boolean> {
  try {
    return await argon2.verify(passwordHash, plainPassword);
  } catch {
    return false;
  }
}

export function generateOpaqueToken(byteLength = 32): string {
  return crypto.randomBytes(byteLength).toString('hex');
}

export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function safeTimingCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export function slugifyFirmName(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  const suffix = crypto.randomBytes(3).toString('hex');
  return `${base || 'firm'}-${suffix}`;
}
