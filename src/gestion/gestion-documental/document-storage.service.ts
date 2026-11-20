import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, mkdir, readFile, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve } from 'node:path';

const EXTENSIONS: Record<string, string> = {
  'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png',
  'application/msword': '.doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
};

@Injectable()
export class DocumentStorageService {
  private readonly root: string;
  constructor(config: ConfigService) { this.root = resolve(process.cwd(), config.getOrThrow<string>('storage.localPath'), 'gestion-documental'); }
  async save(file: Express.Multer.File) {
    const extension = EXTENSIONS[file.mimetype];
    if (!extension) throw new BadRequestException('Tipo de archivo no permitido');
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const key = `${randomUUID()}${extension}`;
    await import('node:fs/promises').then(({ writeFile }) => writeFile(join(this.root, key), file.buffer, { mode: 0o600, flag: 'wx' }));
    return key;
  }
  async get(key: string) {
    if (!/^[0-9a-f-]{36}\.(pdf|jpg|png|doc|docx)$/.test(key)) throw new BadRequestException('Clave de archivo inválida');
    const path = join(this.root, key);
    try { await access(path, constants.R_OK); } catch { throw new NotFoundException('Archivo no encontrado'); }
    return { stream: createReadStream(path), buffer: await readFile(path) };
  }
  async remove(key: string) { try { await unlink(join(this.root, key)); } catch { /* no expose storage details */ } }
}
