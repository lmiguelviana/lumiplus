import crypto from 'crypto';
import { env } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Standard for GCM is 12 bytes (96 bits)
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const KEY_LEN = 32;

/**
 * Serviço responsável por criptografar chaves de API e segredos
 * utilizando uma Master Key central.
 */
export class VaultService {
  private masterKey: Buffer;

  constructor() {
    if (!env.VAULT_MASTER_KEY || env.VAULT_MASTER_KEY.length !== 64) {
      throw new Error('VAULT_MASTER_KEY inválida. Deve ter 64 caracteres hexadecimais (32 bytes).');
    }
    this.masterKey = Buffer.from(env.VAULT_MASTER_KEY, 'hex');
  }

  /**
   * Criptografa um valor (ex: API Key) para armazenamento no banco
   * @param text Texto limpo a ser criptografado
   * @returns String codificada em base64 com {salt}:{iv}:{tag}:{encryptedData}
   */
  encrypt(text: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const salt = crypto.randomBytes(SALT_LENGTH);

    // Deriva uma chave específica usando pbkdf2 para fortalecer a master key
    const key = crypto.pbkdf2Sync(this.masterKey, salt, 100000, KEY_LEN, 'sha512');

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    const tag = cipher.getAuthTag();

    // Formato final salvo no banco: salt(base64):iv(base64):tag(base64):encrypted(base64)
    return `${salt.toString('base64')}:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted}`;
  }

  /**
   * Descriptografa um valor vindo do banco
   * @param encryptedData String no formato {salt}:{iv}:{tag}:{encryptedData}
   * @returns Texto limpo
   */
  decrypt(encryptedData: string): string {
    const parts = encryptedData.split(':');
    
    if (parts.length !== 4) {
      throw new Error('Formato do cofre (Vault) corrompido ou incompatível.');
    }

    const [salt64, iv64, tag64, encryptedText] = parts;
    
    const salt = Buffer.from(salt64, 'base64');
    const iv = Buffer.from(iv64, 'base64');
    const tag = Buffer.from(tag64, 'base64');
    
    const key = crypto.pbkdf2Sync(this.masterKey, salt, 100000, KEY_LEN, 'sha512');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encryptedText, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}

// Singleton export para uso na aplicação
export const vaultService = new VaultService();
