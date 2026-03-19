import crypto from 'crypto';

/**
 * Utilitário de segurança para criptografia de chaves de API.
 * Implementa AES-256-GCM conforme especificado em 04_Seguranca.md.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

export function encrypt(text: string, masterKey: string) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = Buffer.from(masterKey, 'hex');
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(text, 'utf8'),
    cipher.final()
  ]);
  
  const authTag = cipher.getAuthTag();
  
  return {
    encrypted: Buffer.concat([encrypted, authTag]).toString('base64'),
    iv: iv.toString('base64')
  };
}

export function decrypt(encryptedBase64: string, ivBase64: string, masterKey: string) {
  const iv = Buffer.from(ivBase64, 'base64');
  const data = Buffer.from(encryptedBase64, 'base64');
  const key = Buffer.from(masterKey, 'hex');
  
  const authTag = data.subarray(data.length - AUTH_TAG_LENGTH);
  const encrypted = data.subarray(0, data.length - AUTH_TAG_LENGTH);
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]);
  
  return decrypted.toString('utf8');
}
