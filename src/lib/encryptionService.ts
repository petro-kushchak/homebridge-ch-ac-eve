import * as crypto from 'crypto';

const defaultKey = 'a3K8Bx%2r8Y7#xDh';

/**
 * Module containing encryption services
 * @param {String} key AES general key
 */
export class EncryptionService {

  /**
     * Decrypt UDP message
     * @param {object} input Response object
     * @param {string} input.pack Encrypted JSON string
     * @param {string} [key] AES key
     */
  decrypt(input: any, key = defaultKey) {
    const decipher = crypto.createDecipheriv('aes-128-ecb', key, '');
    const str = decipher.update(input.pack, 'base64', 'utf8');
    const response = JSON.parse(str + decipher.final('utf8'));
    return response;
  }

  /**
     * Encrypt UDP message
     * @param {object} output Request object
     * @param {string} [key] AES key
     */
  encrypt(output: any, key = defaultKey) {
    const cipher = crypto.createCipheriv('aes-128-ecb', key, '');
    const str = cipher.update(JSON.stringify(output), 'utf8', 'base64');
    const request = str + cipher.final('base64');
    return request;
  }
}

