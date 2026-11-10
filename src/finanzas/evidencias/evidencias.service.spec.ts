import {
  ConflictException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { StorageService } from '../storage/storage.service';
import { EvidenciasService } from './evidencias.service';

const ids = {
  advisor: '0ffac71e-e568-450c-8578-d4656a520047',
  otherAdvisor: 'db0cbb62-a8ef-4587-8c28-1f3aaf63b20a',
  payment: '39987e79-6ff9-40c7-b069-6aeb3d122cd8',
  evidence: '9e13265b-977c-4e2b-b594-dc0e56d58f70',
};
const pdf = {
  buffer: Buffer.from('%PDF-1.7 fixture'),
  originalname: 'recibo.pdf',
  mimetype: 'application/pdf',
  size: 16,
};

const metadata = {
  id: ids.evidence,
  pago_id: ids.payment,
  tipo_evidencia_id: 10,
  nombre_original: 'recibo.pdf',
  tipo_archivo: 'application/pdf',
  tamano_bytes: pdf.buffer.length,
  hash_archivo: 'a'.repeat(64),
  subido_por: ids.advisor,
  fecha_carga: new Date('2026-11-10T12:00:00Z'),
  tipos_evidencia_pago: { id: 10, nombre: 'Comprobante de efectivo' },
  usuarios: { id: ids.advisor, nombre: 'Ana', apellido_paterno: 'López', apellido_materno: null },
};

describe('EvidenciasService', () => {
  let service: EvidenciasService;
  let prisma: Record<string, any>;
  let storage: Record<string, jest.Mock>;

  beforeEach(() => {
    prisma = {
      pagos: {
        findFirst: jest.fn().mockResolvedValue({
          id: ids.payment,
          formas_pago: { id: 1, nombre: 'Efectivo' },
        }),
      },
      tipos_evidencia_pago: {
        findUnique: jest.fn().mockResolvedValue({
          id: 10,
          nombre: 'Comprobante de efectivo',
        }),
      },
      evidencias_pago: {
        create: jest.fn().mockResolvedValue(metadata),
        findMany: jest.fn().mockResolvedValue([metadata]),
        findFirst: jest.fn().mockResolvedValue({ ...metadata, archivo_path: 'key.pdf' }),
      },
    };
    storage = {
      save: jest.fn().mockResolvedValue('key.pdf'),
      exists: jest.fn(),
      get: jest.fn().mockResolvedValue({ stream: Buffer.from('file'), size: 4 }),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const config = {
      getOrThrow: jest.fn().mockReturnValue(10),
    } as unknown as ConfigService;
    service = new EvidenciasService(
      prisma as unknown as PrismaService,
      storage as unknown as StorageService,
      config,
    );
  });

  it('stores evidence metadata and derives the required type from payment method', async () => {
    const response = await service.upload(ids.payment, pdf, {
      id: ids.advisor,
      activo: true,
      roles: { nombre: 'asesor' },
    });

    expect(prisma.tipos_evidencia_pago.findUnique).toHaveBeenCalledWith({
      where: { nombre: 'Comprobante de efectivo' },
      select: { id: true, nombre: true },
    });
    expect(prisma.evidencias_pago.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pago_id: ids.payment,
          archivo_path: 'key.pdf',
          tamano_bytes: pdf.buffer.length,
          tipo_archivo: 'application/pdf',
          subido_por: ids.advisor,
        }),
      }),
    );
    expect(response).not.toHaveProperty('archivo_path');
  });

  it('hides payments belonging to another advisor', async () => {
    prisma.pagos.findFirst.mockResolvedValue(null);
    await expect(
      service.upload(ids.payment, pdf, {
        id: ids.otherAdvisor,
        activo: true,
        roles: { nombre: 'asesor' },
      }),
    ).rejects.toThrow(NotFoundException);
    expect(storage.save).not.toHaveBeenCalled();
  });

  it('deletes the just-uploaded object when database metadata creation fails', async () => {
    prisma.evidencias_pago.create.mockRejectedValue(new Error('database unavailable'));
    await expect(
      service.upload(ids.payment, pdf, {
        id: ids.advisor,
        activo: true,
        roles: { nombre: 'asesor' },
      }),
    ).rejects.toThrow('database unavailable');
    expect(storage.delete).toHaveBeenCalledWith('key.pdf');
  });

  it('does not fail the database error when compensation fails, and records the incident', async () => {
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    prisma.evidencias_pago.create.mockRejectedValue(new Error('database unavailable'));
    storage.delete.mockRejectedValue(new Error('storage unavailable'));
    await expect(
      service.upload(ids.payment, pdf, {
        id: ids.advisor,
        activo: true,
        roles: { nombre: 'asesor' },
      }),
    ).rejects.toThrow('database unavailable');
    expect(log).toHaveBeenCalledWith(
      'No se pudo compensar una carga sin metadatos en PostgreSQL',
    );
    log.mockRestore();
  });

  it('restricts advisor detail queries and returns metadata without the storage key', async () => {
    const result = await service.findOne(ids.evidence, {
      id: ids.advisor,
      activo: true,
      roles: { nombre: 'asesor' },
    });
    expect(prisma.evidencias_pago.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: ids.evidence,
          pagos: { is: { contratos: { is: { asesor_id: ids.advisor } } } },
        },
      }),
    );
    expect(result).not.toHaveProperty('archivo_path');
  });

  it('rejects unknown roles and missing evidence types', async () => {
    await expect(
      service.findForPayment(ids.payment, {
        id: ids.advisor,
        activo: true,
        roles: { nombre: 'auxiliar' },
      }),
    ).rejects.toThrow('No tienes acceso a evidencias de pago');

    prisma.tipos_evidencia_pago.findUnique.mockResolvedValue(null);
    await expect(
      service.upload(ids.payment, pdf, {
        id: ids.advisor,
        activo: true,
        roles: { nombre: 'asesor' },
      }),
    ).rejects.toThrow(ConflictException);
    expect(storage.save).not.toHaveBeenCalled();
  });
});
