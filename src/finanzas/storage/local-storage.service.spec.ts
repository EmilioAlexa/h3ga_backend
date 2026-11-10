import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { LocalStorageService } from './local-storage.service';

function config(localPath: string): ConfigService {
  return {
    getOrThrow: () => localPath,
  } as unknown as ConfigService;
}

describe('LocalStorageService', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'h3ga-evidence-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('saves privately under a random key and streams it back', async () => {
    const storage = new LocalStorageService(config(root));
    const contents = Buffer.from('%PDF-1.7 local test');
    const key = await storage.save(contents, 'application/pdf');

    expect(key).toMatch(/^[0-9a-f-]{36}\.pdf$/);
    expect(await storage.exists(key)).toBe(true);
    const stored = await storage.get(key);
    const chunks: Buffer[] = [];
    for await (const chunk of stored.stream) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks)).toEqual(contents);
    expect(stored.size).toBe(contents.length);
  });

  it('does not overwrite generated names and deletes only its internal key', async () => {
    const storage = new LocalStorageService(config(root));
    const first = await storage.save(Buffer.from('%PDF-first'), 'application/pdf');
    const second = await storage.save(Buffer.from('%PDF-second'), 'application/pdf');
    expect(second).not.toBe(first);
    await storage.delete(first);
    expect(await storage.exists(first)).toBe(false);
    await expect(storage.get(first)).rejects.toThrow(NotFoundException);
  });

  it('rejects traversal keys and directories inside src', async () => {
    const storage = new LocalStorageService(config(root));
    await expect(storage.get('../../secret')).rejects.toThrow(BadRequestException);
    expect(() => new LocalStorageService(config(resolve(process.cwd(), 'src', 'unsafe')))).toThrow(
      'LOCAL_STORAGE_PATH debe estar fuera de src',
    );
  });

  it('rejects unsupported storage content types', async () => {
    const storage = new LocalStorageService(config(root));
    await expect(storage.save(Buffer.from('x'), 'text/plain')).rejects.toThrow(
      BadRequestException,
    );
  });
});
