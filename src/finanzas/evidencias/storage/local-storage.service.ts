import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, mkdir, open, realpath, stat, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { StorageService, StoredObject } from './storage.service';

const CONTENT_EXTENSIONS: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
};

@Injectable()
export class LocalStorageService implements StorageService {
  private readonly rootPath: string;
  private readonly sourcePath: string;

  constructor(config: ConfigService) {
    const configuredPath = config.getOrThrow<string>('storage.localPath');
    this.rootPath = resolve(process.cwd(), configuredPath);
    this.sourcePath = resolve(process.cwd(), 'src');
    this.assertOutsideSource(this.rootPath);
  }

  async save(buffer: Buffer, contentType: string): Promise<string> {
    const extension = CONTENT_EXTENSIONS[contentType];
    if (!extension) throw new BadRequestException('Tipo de archivo no permitido');
    await this.ensureSafeRoot();

    const key = `${randomUUID()}${extension}`;
    const destination = this.getPathForKey(key);
    const handle = await open(destination, 'wx', 0o600);
    try {
      await handle.writeFile(buffer);
    } catch (error) {
      await handle.close();
      try {
        await unlink(destination);
      } catch {
        // The failed write is surfaced; no client controlled path is involved.
      }
      throw error;
    }
    await handle.close();
    return key;
  }

  async exists(key: string): Promise<boolean> {
    const filePath = this.getPathForKey(key);
    try {
      await access(filePath, constants.F_OK);
      return true;
    } catch (error) {
      if (this.isNotFound(error)) return false;
      throw error;
    }
  }

  async get(key: string): Promise<StoredObject> {
    const filePath = this.getPathForKey(key);
    try {
      const fileInfo = await stat(filePath);
      if (!fileInfo.isFile()) throw new NotFoundException('Archivo no encontrado');
      return { stream: createReadStream(filePath), size: fileInfo.size };
    } catch (error) {
      if (this.isNotFound(error)) throw new NotFoundException('Archivo no encontrado');
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    const filePath = this.getPathForKey(key);
    try {
      await unlink(filePath);
    } catch (error) {
      if (!this.isNotFound(error)) throw error;
    }
  }

  private async ensureSafeRoot(): Promise<void> {
    try {
      await mkdir(this.rootPath, { recursive: true, mode: 0o700 });
      const [realRoot, realSource] = await Promise.all([
        realpath(this.rootPath),
        realpath(this.sourcePath),
      ]);
      this.assertOutsideSource(realRoot, realSource);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        'No se puede inicializar la ruta privada de almacenamiento local',
      );
    }
  }

  private getPathForKey(key: string): string {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(pdf|jpg)$/.test(key)) {
      throw new BadRequestException('Clave de almacenamiento inválida');
    }
    const path = resolve(this.rootPath, key);
    const pathFromRoot = relative(this.rootPath, path);
    if (
      !pathFromRoot ||
      pathFromRoot.startsWith(`..${sep}`) ||
      pathFromRoot === '..' ||
      isAbsolute(pathFromRoot)
    ) {
      throw new BadRequestException('Clave de almacenamiento inválida');
    }
    return path;
  }

  private assertOutsideSource(root: string, source = this.sourcePath): void {
    const fromSource = relative(source, root);
    if (
      fromSource === '' ||
      (!fromSource.startsWith(`..${sep}`) && fromSource !== '..' && !isAbsolute(fromSource))
    ) {
      throw new Error('LOCAL_STORAGE_PATH debe estar fuera de src');
    }
  }

  private isNotFound(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error.code === 'ENOENT' || error.code === 'ENOTDIR')
    );
  }
}
