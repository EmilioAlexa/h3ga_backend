import {
  BadRequestException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { StorageService, StoredObject } from './storage.service';

/** Private S3-compatible storage. Construction performs no network operations. */
export class S3StorageService implements StorageService {
  private readonly logger = new Logger(S3StorageService.name);
  private readonly bucket: string;
  private readonly client: S3Client;

  constructor(config: ConfigService, client?: S3Client) {
    this.bucket = config.getOrThrow<string>('storage.s3.bucket');
    const endpoint = config.getOrThrow<string>('storage.s3.endpoint');
    if (new URL(endpoint).protocol !== 'https:') {
      throw new Error(
        'El almacenamiento S3 privado requiere un endpoint HTTPS',
      );
    }
    this.client =
      client ??
      new S3Client({
        endpoint,
        region: config.getOrThrow<string>('storage.s3.region'),
        credentials: {
          accessKeyId: config.getOrThrow<string>('storage.s3.accessKey'),
          secretAccessKey: config.getOrThrow<string>('storage.s3.secretKey'),
        },
      });
  }

  async save(buffer: Buffer, contentType: string): Promise<string> {
    const extension =
      contentType === 'application/pdf'
        ? '.pdf'
        : contentType === 'image/jpeg'
          ? '.jpg'
          : contentType === 'image/png'
            ? '.png'
            : null;
    if (!extension)
      throw new BadRequestException('Tipo de archivo no permitido');
    const key = `${randomUUID()}${extension}`;
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: contentType,
          ACL: 'private',
          CacheControl: 'private, no-store',
        }),
      );
    } catch (error) {
      try {
        await this.client.send(
          new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
        );
      } catch {
        this.logger.error(`Limpieza S3 pendiente para objeto privado ${key}`);
      }
      throw error;
    }
    return key;
  }

  async exists(key: string): Promise<boolean> {
    this.assertKey(key);
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch (error) {
      if (this.isNotFound(error)) return false;
      throw error;
    }
  }

  async get(key: string): Promise<StoredObject> {
    this.assertKey(key);
    try {
      const object = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (
        !(object.Body instanceof Readable) ||
        object.ContentLength === undefined
      ) {
        throw new InternalServerErrorException(
          'El almacenamiento no devolvió un archivo válido',
        );
      }
      return { stream: object.Body, size: object.ContentLength };
    } catch (error) {
      if (this.isNotFound(error))
        throw new NotFoundException('Archivo no encontrado');
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    this.assertKey(key);
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  private assertKey(key: string): void {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png)$/i.test(
        key,
      )
    ) {
      throw new BadRequestException('Identificador de archivo no válido');
    }
  }

  private isNotFound(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      '$metadata' in error &&
      (error as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode === 404
    );
  }
}
