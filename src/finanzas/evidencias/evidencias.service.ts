import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../../generated/prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { StorageService, StoredObject } from './storage/storage.service';
import {
  UploadedEvidenceFile,
  validateEvidenceFile,
} from './evidence-file.validator';

type AuthenticatedUser = {
  id: string;
  activo: boolean;
  roles: { nombre: string };
};

const ALLOWED_ROLES = ['administrador', 'administrador financiero', 'asesor'];

type EvidenceMetadata = {
  id: string;
  pago_id: string;
  tipo_evidencia_id: number | null;
  nombre_original: string | null;
  tipo_archivo: string | null;
  tamano_bytes: number | null;
  hash_archivo: string | null;
  subido_por: string | null;
  fecha_carga: Date;
  tipos_evidencia_pago: { id: number; nombre: string } | null;
  usuarios: {
    id: string;
    nombre: string;
    apellido_paterno: string;
    apellido_materno: string | null;
  } | null;
};

const evidenceSelect = {
  id: true,
  pago_id: true,
  tipo_evidencia_id: true,
  nombre_original: true,
  tipo_archivo: true,
  tamano_bytes: true,
  hash_archivo: true,
  subido_por: true,
  fecha_carga: true,
  tipos_evidencia_pago: { select: { id: true, nombre: true } },
  usuarios: {
    select: { id: true, nombre: true, apellido_paterno: true, apellido_materno: true },
  },
} as const;

const evidenceWithPaymentSelect = {
  ...evidenceSelect,
  archivo_path: true,
  pagos: {
    select: {
      id: true,
      forma_pago_id: true,
      formas_pago: { select: { id: true, nombre: true } },
      contratos: { select: { asesor_id: true } },
    },
  },
} as const;

export interface EvidenceDownload {
  metadata: EvidenceMetadata;
  object: StoredObject;
}

@Injectable()
export class EvidenciasService {
  private readonly logger = new Logger(EvidenciasService.name);
  private readonly maxSizeBytes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    config: ConfigService,
  ) {
    this.maxSizeBytes = config.getOrThrow<number>('storage.maxFileSizeMb') * 1024 * 1024;
  }

  async upload(
    pagoId: string,
    file: UploadedEvidenceFile | undefined,
    usuario: AuthenticatedUser,
  ) {
    this.ensureCanUpload(usuario);
    const pago = await this.findAccessiblePayment(pagoId, usuario);
    if (!pago.formas_pago) {
      throw new ConflictException('El pago no tiene una forma de pago válida');
    }
    const requiredEvidenceName = this.evidenceTypeForMethod(pago.formas_pago.nombre);
    const validated = validateEvidenceFile(file, this.maxSizeBytes);
    const evidenceType = await this.prisma.tipos_evidencia_pago.findUnique({
      where: { nombre: requiredEvidenceName },
      select: { id: true, nombre: true },
    });
    if (!evidenceType) {
      throw new ConflictException(
        `No está configurado el tipo de evidencia requerido: ${requiredEvidenceName}`,
      );
    }

    const key = await this.storage.save(validated.buffer, validated.contentType);
    try {
      const evidence = await this.prisma.evidencias_pago.create({
        data: {
          pago_id: pago.id,
          tipo_evidencia_id: evidenceType.id,
          archivo_path: key,
          nombre_original: validated.originalName,
          tipo_archivo: validated.contentType,
          tamano_bytes: validated.size,
          hash_archivo: createHash('sha256').update(validated.buffer).digest('hex'),
          subido_por: usuario.id,
        },
        select: evidenceSelect,
      });
      return publicEvidence(evidence);
    } catch (error) {
      try {
        await this.storage.delete(key);
      } catch {
        // Do not include file names, storage paths, or document contents in logs.
        this.logger.error('No se pudo compensar una carga sin metadatos en PostgreSQL');
      }
      this.handlePrismaError(error);
    }
  }

  async findForPayment(pagoId: string, usuario: AuthenticatedUser) {
    this.ensureCanRead(usuario);
    await this.findAccessiblePayment(pagoId, usuario);
    const evidences = await this.prisma.evidencias_pago.findMany({
      where: { pago_id: pagoId },
      select: evidenceSelect,
      orderBy: [{ fecha_carga: 'desc' }, { id: 'desc' }],
    });
    return evidences.map(publicEvidence);
  }

  async findOne(id: string, usuario: AuthenticatedUser) {
    const evidence = await this.findAccessibleEvidence(id, usuario);
    return publicEvidence(evidence);
  }

  async download(id: string, usuario: AuthenticatedUser): Promise<EvidenceDownload> {
    const evidence = await this.findAccessibleEvidence(id, usuario);
    let object: StoredObject;
    try {
      object = await this.storage.get(evidence.archivo_path);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException('El archivo de evidencia no está disponible');
      }
      throw error;
    }
    return { metadata: publicEvidence(evidence), object };
  }

  private async findAccessiblePayment(pagoId: string, usuario: AuthenticatedUser) {
    const payment = await this.prisma.pagos.findFirst({
      where: {
        id: pagoId,
        ...(usuario.roles.nombre === 'asesor'
          ? { contratos: { is: { asesor_id: usuario.id } } }
          : {}),
      },
      select: {
        id: true,
        formas_pago: { select: { id: true, nombre: true } },
      },
    });
    if (!payment) throw new NotFoundException('Pago no encontrado');
    return payment;
  }

  private async findAccessibleEvidence(id: string, usuario: AuthenticatedUser) {
    this.ensureCanRead(usuario);
    const evidence = await this.prisma.evidencias_pago.findFirst({
      where: {
        id,
        ...(usuario.roles.nombre === 'asesor'
          ? { pagos: { is: { contratos: { is: { asesor_id: usuario.id } } } } }
          : {}),
      },
      select: evidenceWithPaymentSelect,
    });
    if (!evidence) throw new NotFoundException('Evidencia no encontrada');
    return evidence;
  }

  private ensureCanRead(usuario: AuthenticatedUser) {
    if (!ALLOWED_ROLES.includes(usuario?.roles?.nombre)) {
      throw new ForbiddenException('No tienes acceso a evidencias de pago');
    }
  }

  private ensureCanUpload(usuario: AuthenticatedUser) {
    this.ensureCanRead(usuario);
    if (!usuario.activo) throw new ForbiddenException('La cuenta no está activa');
  }

  private evidenceTypeForMethod(method: string): string {
    const normalized = method
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es-MX');
    if (normalized.includes('efectivo')) return 'Comprobante de efectivo';
    if (normalized.includes('transferencia') || normalized.includes('deposito')) {
      return 'Comprobante bancario';
    }
    if (normalized.includes('cheque')) return 'Comprobante de cheque';
    throw new BadRequestException(
      'La forma de pago no corresponde a efectivo, transferencia, depósito o cheque',
    );
  }

  private handlePrismaError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2003') {
        throw new ConflictException('El pago o tipo de evidencia cambió durante la carga');
      }
      if (error.code === 'P2025') throw new NotFoundException('Pago no encontrado');
    }
    throw error;
  }
}

function publicEvidence<T extends EvidenceMetadata & { archivo_path?: string }>(
  evidence: T,
): EvidenceMetadata {
  const { archivo_path: _privateKey, ...metadata } = evidence;
  return metadata as EvidenceMetadata;
}
