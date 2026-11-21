import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageService } from '../../evidencias/storage/storage.service';
import { LocalStorageService } from '../../evidencias/storage/local-storage.service';
import { S3StorageService } from '../../evidencias/storage/s3-storage.service';
export const CONTRACT_STORAGE = Symbol('CONTRACT_STORAGE');
/** A server-owned provider prefix keeps earlier local documents readable after enabling Spaces. */
export class ContractStorageRouter extends StorageService {
  constructor(
    private readonly config: ConfigService,
    private local?: StorageService,
    private s3?: StorageService,
  ) {
    super();
  }
  private provider(kind: string) {
    if (kind === 'local')
      return (this.local ??= new LocalStorageService(this.config));
    if (kind === 's3') return (this.s3 ??= new S3StorageService(this.config));
    throw new BadRequestException('Proveedor de documento no valido');
  }
  private parse(key: string) {
    const match =
      /^(local|s3):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:pdf|jpg|png))$/i.exec(
        key,
      );
    if (!match)
      throw new BadRequestException('Clave privada de documento no valida');
    return { kind: match[1], key: match[2] };
  }
  async save(bytes: Buffer, mime: string) {
    const kind = this.config.getOrThrow<string>('storage.provider');
    return `${kind}:${await this.provider(kind).save(bytes, mime)}`;
  }
  async exists(key: string) {
    const parsed = this.parse(key);
    return this.provider(parsed.kind).exists(parsed.key);
  }
  async get(key: string) {
    const parsed = this.parse(key);
    return this.provider(parsed.kind).get(parsed.key);
  }
  async delete(key: string) {
    const parsed = this.parse(key);
    return this.provider(parsed.kind).delete(parsed.key);
  }
}
export const contractStorageProvider = {
  provide: CONTRACT_STORAGE,
  inject: [ConfigService],
  useFactory: (config: ConfigService) =>
    new ContractStorageRouter(
      new ConfigService({ storage: config.getOrThrow('contractStorage') }),
    ),
};
