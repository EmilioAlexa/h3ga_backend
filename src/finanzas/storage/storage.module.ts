import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LocalStorageService } from './local-storage.service';
import { StorageService } from './storage.service';

export function createStorageProvider(config: ConfigService): StorageService {
  const provider = config.getOrThrow<string>('storage.provider');
  if (provider === 'local') return new LocalStorageService(config);
  if (provider === 's3') {
    throw new Error(
      'STORAGE_PROVIDER=s3 requiere implementar el adaptador S3. No se realizó ninguna conexión externa; use local hasta habilitarlo.',
    );
  }
  throw new Error(`Proveedor de almacenamiento no soportado: ${provider}`);
}

@Module({
  providers: [
    {
      provide: StorageService,
      inject: [ConfigService],
      useFactory: createStorageProvider,
    },
  ],
  exports: [StorageService],
})
export class StorageModule {}
