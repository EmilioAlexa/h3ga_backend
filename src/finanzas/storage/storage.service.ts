import { Readable } from 'node:stream';

export interface StoredObject {
  stream: Readable;
  size: number;
}

export abstract class StorageService {
  abstract save(buffer: Buffer, contentType: string): Promise<string>;
  abstract exists(key: string): Promise<boolean>;
  abstract get(key: string): Promise<StoredObject>;
  abstract delete(key: string): Promise<void>;
}
