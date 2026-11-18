import crypto from 'node:crypto';

const SESSION_SECRET = process.env.SESSION_SECRET || 'preflight-dev-insecure-secret-32-chars-long!';

/**
 * Derives a 32-byte key from SESSION_SECRET for AES-256-GCM.
 */
function getEncryptionKey(): Buffer {
  return crypto.createHash('sha256').update(SESSION_SECRET).digest();
}

/**
 * Encrypts a string using AES-256-GCM.
 * Output format: iv:authTag:ciphertext (hex)
 */
export function encryptData(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts a string previously encrypted with encryptData.
 */
export function decryptData(cipherTextWithMeta: string): string {
  const parts = cipherTextWithMeta.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }
  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Hashes a secret or token using SHA-256.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Secure password hashing using scrypt with random salt.
 * Stored format: scrypt:salt:hash
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`scrypt:${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

/**
 * Verifies a password against the stored hash in constant time.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }
  const [, salt, expectedHashHex] = parts;
  const expectedHash = Buffer.from(expectedHashHex, 'hex');

  return new Promise((resolve) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return resolve(false);
      try {
        resolve(crypto.timingSafeEqual(derivedKey, expectedHash));
      } catch {
        resolve(false);
      }
    });
  });
}

/**
 * Generates a signed session token.
 * Payload includes userId, workspaceId, role, exp.
 */
export interface SessionPayload {
  userId: string;
  workspaceId: string;
  role: string;
  exp: number; // Unix timestamp in seconds
}

export function createSessionToken(payload: SessionPayload): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const hmac = crypto.createHmac('sha256', SESSION_SECRET);
  hmac.update(payloadB64);
  const sigB64 = hmac.digest('base64url');
  return `${payloadB64}.${sigB64}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;

  const hmac = crypto.createHmac('sha256', SESSION_SECRET);
  hmac.update(payloadB64);
  const expectedSigB64 = hmac.digest('base64url');

  try {
    const a = Buffer.from(sigB64, 'base64url');
    const b = Buffer.from(expectedSigB64, 'base64url');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return null;
    }
    const payload: SessionPayload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
