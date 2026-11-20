import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ProcesoFinalService } from './proceso-final.service';

const asesor = { id: '11111111-1111-4111-8111-111111111111', roles: { nombre: 'asesor' } };
const administrador = { id: '22222222-2222-4222-8222-222222222222', roles: { nombre: 'administrador' } };

describe('ProcesoFinalService', () => {
  it('rechaza el acceso directo de un rol distinto de asesor', async () => {
    const service = new ProcesoFinalService({} as any);
    await expect(service.findClientes({ page: 1, limit: 20, orden: 'nombre' }, administrador)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('registra el historial en la misma transacción al finalizar una etapa', async () => {
    const etapa = {
      id: '33333333-3333-4333-8333-333333333333', cliente_id: '44444444-4444-4444-8444-444444444444', estatus_id: 3,
      avance_porcentaje: 50, accion_a_realizar: null, fecha_compromiso: null, fecha_completada: null, reactivado_en: null,
      motivo_rechazo: null, actualizado_el: new Date(), etapas_proceso: { id: 8, numero_paso: 8, nombre: 'IMSS' },
      estatus_tramite: { id: 3, nombre: 'En proceso asesor', categoria: 'en_proceso' }, pension_final_datos_tramite: null, documentos: [],
    };
    const tx = { etapas_tramite: { update: jest.fn().mockResolvedValue(etapa) }, etapas_tramite_historial: { create: jest.fn().mockResolvedValue({}) } };
    const prisma = {
      etapas_tramite: { findFirst: jest.fn().mockResolvedValue(etapa) },
      estatus_tramite: { findUnique: jest.fn().mockResolvedValue({ id: 6, nombre: 'Finalizado' }) },
      $transaction: jest.fn(async (fn: any) => fn(tx)),
    };
    const service = new ProcesoFinalService(prisma as any);
    await service.updateEtapa(etapa.cliente_id, etapa.id, { estatus_id: 6 }, asesor);
    expect(tx.etapas_tramite.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ avance_porcentaje: 100 }) }));
    expect(tx.etapas_tramite_historial.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ estatus_anterior_id: 3, estatus_nuevo_id: 6, cambiado_por: asesor.id }) }));
  });

  it('rechaza avance editable fuera del rango de un estado en proceso', async () => {
    const etapa = { id: '33333333-3333-4333-8333-333333333333', cliente_id: '44444444-4444-4444-8444-444444444444', estatus_id: 3, avance_porcentaje: 50, accion_a_realizar: null, fecha_compromiso: null, fecha_completada: null, reactivado_en: null, motivo_rechazo: null, actualizado_el: new Date(), etapas_proceso: { id: 8, numero_paso: 8, nombre: 'IMSS' }, estatus_tramite: { id: 3, nombre: 'En proceso asesor', categoria: 'en_proceso' }, pension_final_datos_tramite: null, documentos: [] };
    const prisma = { etapas_tramite: { findFirst: jest.fn().mockResolvedValue(etapa) }, estatus_tramite: { findUnique: jest.fn().mockResolvedValue({ id: 3, nombre: 'En proceso asesor' }) } };
    const service = new ProcesoFinalService(prisma as any);
    await expect(service.updateEtapa(etapa.cliente_id, etapa.id, { avance_porcentaje: 91 }, asesor)).rejects.toBeInstanceOf(BadRequestException);
  });
});
