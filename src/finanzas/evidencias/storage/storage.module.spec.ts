import { ConfigService } from '@nestjs/config';
import { envValidationSchema } from '../../../config/env.validation';
import { LocalStorageService } from './local-storage.service';
import { createStorageProvider } from './storage.module';
import { S3StorageService } from './s3-storage.service';

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

  it('constructs the configured private S3 adapter without connecting', () => {
    expect(createStorageProvider(config({ storage: { provider: 's3', s3: {
      endpoint: 'https://storage.invalid', bucket: 'private-test', region: 'test',
      accessKey: 'test', secretKey: 'test',
    } } }))).toBeInstanceOf(S3StorageService);
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
