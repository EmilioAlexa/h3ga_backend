import { CONTRACT_STORAGE } from './contract-storage.provider';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import { StorageService } from '../../evidencias/storage/storage.service';
import { UploadedEvidenceFile } from '../../evidencias/evidence-file.validator';
import { ContractSchemaService } from '../contract-schema.service';
import { validateContractDocument } from './contract-document.validator';

type Actor = { id: string; activo: boolean; roles: { nombre: string } };
const visible = {
  id: true,
  contrato_id: true,
  subido_por: true,
  solicitud_id: true,
  nombre_original: true,
  mime_type: true,
  tamano_bytes: true,
  sha256: true,
  creado_en: true,
} as const;
@Injectable()
export class ContractDocumentsService {
  private readonly logger = new Logger(ContractDocumentsService.name);
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONTRACT_STORAGE) private readonly storage: StorageService,
    private readonly schema: ContractSchemaService,
  ) {}
  private scope(id: string, user: Actor) {
    if (
      !user?.activo ||
      !['administrador', 'administrador financiero', 'asesor'].includes(
        user.roles?.nombre,
      )
    )
      throw new ForbiddenException('Acceso no autorizado');
    return {
      id,
      ...(user.roles.nombre === 'asesor' ? { asesor_id: user.id } : {}),
    };
  }
  private async access(id: string, user: Actor) {
    const where = this.scope(id, user);
    if (
      !(await this.prisma.contratos.findFirst({ where, select: { id: true } }))
    )
      throw new NotFoundException('Contrato no encontrado');
    await this.schema.requireDocuments();
  }
  async list(id: string, user: Actor) {
    await this.access(id, user);
    return this.prisma.documentos_contrato.findMany({
      where: { contrato_id: id },
      select: visible,
      orderBy: [{ creado_en: 'desc' }, { id: 'desc' }],
    });
  }
  async upload(
    id: string,
    requestId: string,
    file: UploadedEvidenceFile | undefined,
    user: Actor,
  ) {
    await this.access(id, user);
    const data = validateContractDocument(file);
    const hash = createHash('sha256').update(data.bytes).digest('hex');
    const prior = await this.prisma.documentos_contrato.findFirst({
      where: { contrato_id: id, solicitud_id: requestId },
      select: visible,
    });
    const same = (r: typeof prior) =>
      r &&
      r.sha256 === hash &&
      r.mime_type === data.mime &&
      r.nombre_original === data.name;
    if (prior) {
      if (!same(prior))
        throw new ConflictException('Solicitud reutilizada con otro documento');
      return prior;
    }
    const key = await this.storage.save(data.bytes, data.mime);
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (
          !(await tx.contratos.findFirst({
            where: this.scope(id, user),
            select: { id: true },
          }))
        )
          throw new NotFoundException('Contrato no encontrado');
        return tx.documentos_contrato.create({
          data: {
            contrato_id: id,
            subido_por: user.id,
            solicitud_id: requestId,
            nombre_original: data.name,
            mime_type: data.mime,
            tamano_bytes: data.size,
            sha256: hash,
            clave_privada: key,
          },
          select: visible,
        });
      });
    } catch (error) {
      // Resolve uncertain commit before deleting an object that may already be referenced.
      let saved: Awaited<
        ReturnType<typeof this.prisma.documentos_contrato.findFirst>
      >;
      try {
        saved = await this.prisma.documentos_contrato.findFirst({
          where: { contrato_id: id, solicitud_id: requestId },
        });
      } catch {
        this.logger.error(
          `Conciliacion de almacenamiento requerida para solicitud ${requestId}; objeto privado ${key}`,
        );
        throw error;
      }
      if (saved?.clave_privada !== key) {
        try {
          await this.storage.delete(key);
        } catch {
          this.logger.error(
            `Limpieza pendiente para solicitud ${requestId}; objeto privado ${key}`,
          );
        }
      }
      if (saved && same(saved)) {
        const { clave_privada: _, ...metadata } = saved;
        return metadata;
      }
      if (saved)
        throw new ConflictException('Solicitud reutilizada con otro documento');
      throw error;
    }
  }
  async download(id: string, documentId: string, user: Actor) {
    await this.access(id, user);
    const row = await this.prisma.documentos_contrato.findFirst({
      where: { id: documentId, contrato_id: id },
    });
    if (!row) throw new NotFoundException('Documento no encontrado');
    const object = await this.storage.get(row.clave_privada);
    if (object.size !== row.tamano_bytes) {
      object.stream.destroy();
      throw new ConflictException('Integridad del documento no verificada');
    }
    // Verify full digest before serving; documents have a bounded 10 MiB size.
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of object.stream) {
      const bytes = Buffer.from(chunk);
      size += bytes.length;
      if (size > 10485760)
        throw new BadRequestException('Documento excede el limite');
      chunks.push(bytes);
    }
    const bytes = Buffer.concat(chunks);
    if (createHash('sha256').update(bytes).digest('hex') !== row.sha256)
      throw new ConflictException('Integridad del documento no verificada');
    return { bytes, name: row.nombre_original, mime: row.mime_type };
  }
}
