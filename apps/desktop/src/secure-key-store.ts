import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

export interface AsyncSafeStorage {
  decryptStringAsync(encrypted: Buffer): Promise<{
    result: string;
    shouldReEncrypt: boolean;
  }>;
  encryptStringAsync(plainText: string): Promise<Buffer>;
  isAsyncEncryptionAvailable(): Promise<boolean>;
}

export class SecureApiKeyStore {
  constructor(
    private readonly safeStorage: AsyncSafeStorage,
    private readonly filePath: string,
  ) {}

  async set(apiKey: string): Promise<void> {
    const normalized = apiKey.trim();
    if (!normalized) throw new Error("API key cannot be empty");
    if (!await this.safeStorage.isAsyncEncryptionAvailable()) {
      throw new Error("Operating-system encryption is unavailable");
    }
    const encrypted = await this.safeStorage.encryptStringAsync(normalized);
    mkdirSync(dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    writeFileSync(temporary, encrypted, { mode: 0o600 });
    renameSync(temporary, this.filePath);
  }

  async get(): Promise<string | null> {
    if (!existsSync(this.filePath)) return null;
    const encrypted = readFileSync(this.filePath);
    const decrypted = await this.safeStorage.decryptStringAsync(encrypted);
    if (decrypted.shouldReEncrypt) await this.set(decrypted.result);
    return decrypted.result;
  }

  has(): boolean {
    return existsSync(this.filePath);
  }

  clear(): void {
    if (existsSync(this.filePath)) unlinkSync(this.filePath);
  }
}
