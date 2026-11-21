import { ConfigService } from '@nestjs/config';
import { ContractStorageRouter } from './contract-storage.provider';
describe('contract storage routing', () => {
  it('writes to the configured provider and reads historical local objects without relocation', async () => {
    const key = '00000000-0000-4000-8000-000000000001.png';
    const local = {
      save: jest.fn(),
      get: jest.fn().mockResolvedValue('local bytes'),
      delete: jest.fn(),
    };
    const cloud = {
      save: jest.fn().mockResolvedValue(key),
      get: jest.fn(),
      delete: jest.fn(),
    };
    const router = new ContractStorageRouter(
      new ConfigService({ storage: { provider: 's3' } }),
      local as any,
      cloud as any,
    );
    expect(await router.save(Buffer.from('png'), 'image/png')).toBe(
      's3:' + key,
    );
    expect(await router.get('local:' + key)).toBe('local bytes');
    await router.delete('s3:' + key);
    expect(cloud.delete).toHaveBeenCalledWith(key);
    expect(local.delete).not.toHaveBeenCalled();
    await expect(router.get('local:../../secret')).rejects.toMatchObject({
      status: 400,
    });
    await expect(router.get('https://public/file.pdf')).rejects.toMatchObject({
      status: 400,
    });
  });
});
