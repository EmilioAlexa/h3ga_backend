import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import { S3StorageService } from './s3-storage.service';

describe('private S3 storage (network mocked)', () => {
  const key = '00000000-0000-4000-8000-000000000001.pdf';
  const config = { getOrThrow: (name: string) => ({
    'storage.s3.bucket': 'private-test', 'storage.s3.endpoint': 'https://storage.invalid',
  })[name] } as unknown as ConfigService;
  let send: jest.Mock;
  let storage: S3StorageService;
  beforeEach(() => {
    send = jest.fn();
    storage = new S3StorageService(config, { send } as unknown as S3Client);
  });
  it('uploads with private ACL and an opaque key, without publishing a URL', async () => {
    send.mockResolvedValue({});
    const result = await storage.save(Buffer.from('%PDF-test'), 'application/pdf');
    expect(result).toMatch(/^[0-9a-f-]+\.pdf$/);
    const command = send.mock.calls[0][0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({ ACL: 'private', CacheControl: 'private, no-store', ContentType: 'application/pdf' });
    expect(command.input.Key).not.toContain('http');
  });
  it('returns an authorized stream and its actual size', async () => {
    const stream = Readable.from(Buffer.from('pdf'));
    send.mockResolvedValue({ Body: stream, ContentLength: 3 });
    expect(await storage.get(key)).toEqual({ stream, size: 3 });
    expect(send.mock.calls[0][0]).toBeInstanceOf(GetObjectCommand);
  });
  it('distinguishes missing objects from denied access and validates keys', async () => {
    send.mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } });
    expect(await storage.exists(key)).toBe(false);
    expect(send.mock.calls[0][0]).toBeInstanceOf(HeadObjectCommand);
    const denied = { $metadata: { httpStatusCode: 403 } };
    send.mockRejectedValueOnce(denied);
    await expect(storage.exists(key)).rejects.toEqual(denied);
    await expect(storage.get('../private.pdf')).rejects.toThrow('Identificador');
    await expect(storage.save(Buffer.from('x'), 'image/png')).rejects.toThrow('Tipo de archivo');
  });
  it('rejects non-HTTPS endpoints before constructing a client', () => {
    const insecure = { getOrThrow: (name: string) => name.endsWith('endpoint') ? 'http://storage.invalid' : 'private' } as unknown as ConfigService;
    expect(() => new S3StorageService(insecure)).toThrow('HTTPS');
  });
});
