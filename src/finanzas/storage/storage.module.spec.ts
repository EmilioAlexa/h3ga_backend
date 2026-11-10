import { ConfigService } from '@nestjs/config';
import { envValidationSchema } from '../../config/env.validation';
import { LocalStorageService } from './local-storage.service';
import { createStorageProvider } from './storage.module';

function config(values: Record<string, unknown>): ConfigService {
  return {
    getOrThrow: (key: string) => key.split('.').reduce<any>((object, part) => object?.[part], values),
  } as unknown as ConfigService;
}

describe('storage provider configuration', () => {
  const baseEnvironment = {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://user:password@localhost:5432/test',
    JWT_SECRET: 'a'.repeat(32),
  };

  it('selects local storage by configuration', () => {
    expect(
      createStorageProvider(config({ storage: { provider: 'local', localPath: './storage/test' } })),
    ).toBeInstanceOf(LocalStorageService);
  });

  it('rejects S3 startup until an implementation exists instead of falling back to local', () => {
    expect(() =>
      createStorageProvider(config({ storage: { provider: 's3' } })),
    ).toThrow('requiere implementar el adaptador S3');
  });

  it('requires every S3 setting when S3 is selected', () => {
    const invalid = envValidationSchema.validate({
      ...baseEnvironment,
      STORAGE_PROVIDER: 's3',
    });
    expect(invalid.error).toBeDefined();
    expect(invalid.error?.message).toContain('S3_ENDPOINT');
  });
});
