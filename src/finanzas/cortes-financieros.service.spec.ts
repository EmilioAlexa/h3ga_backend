import {
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { CortesFinancierosService } from './cortes-financieros.service';

const ids = {
  admin: '75f88a9b-5680-4330-9fc8-474d6092ec1d',
  advisor: '0ffac71e-e568-450c-8578-d4656a520047',
  cut: 'caf2c963-4531-4998-80d8-655cb904d192',
  payment: '39987e79-6ff9-40c7-b069-6aeb3d122cd8',
  otherPayment: '4d579eec-d3d1-448e-b38a-e20d8e83a033',
};
const admin = {
  id: ids.admin,
  activo: true,
  roles: { nombre: 'administrador' },
};
const advisor = { id: ids.advisor, activo: true, roles: { nombre: 'asesor' } };
const stateIds: Record<string, number> = {
  'En preparación': 11,
  Abierto: 12,
  Cerrado: 13,
  Cancelado: 14,
};
const payment = (id: string, state: string, amount: string) => ({
  id,
  monto: new Prisma.Decimal(amount),
  fecha_pago: new Date('2026-11-07T18:00:00.000Z'),
  referencia_pago: `REF-${id.slice(0, 4)}`,
  folio_recibo: null,
  estado_pago_id: 1,
  estados_pago: { id: 1, nombre: state },
  formas_pago: { id: 1, nombre: 'Transferencia' },
  contratos: {
    id: ids.cut,
    folio: 'CONT-01',
    asesor_id: ids.advisor,
    usuarios: {
      id: ids.advisor,
      nombre: 'Asesor',
      apellido_paterno: 'Prueba',
      apellido_materno: null,
    },
    clientes: {
      id: 'e96a633b-2a1e-43c4-a870-ea67de1fb4cd',
      nombre: 'Cliente',
      apellido_paterno: 'Prueba',
      apellido_materno: null,
    },
    servicios: { id: 1, nombre: 'Modalidad 40' },
  },
  comisiones: [],
});

describe('CortesFinancierosService', () => {
  let service: CortesFinancierosService;
  let prisma: Record<string, any>;
  let tx: Record<string, any>;
  let cut: Record<string, any>;
  let payments: ReturnType<typeof payment>[];
  let details: Array<Record<string, any>>;
  let paymentReservations: Array<{ pago_id: string; corte_id: string }>;
  let periodReservations: Array<Record<string, any>>;
  let history: Array<Record<string, any>>;

  const status = () => ({ id: stateIds[cut.state], nombre: cut.state });
  const fullCut = () => ({
    id: cut.id,
    numero_corte: cut.numero_corte,
    fecha_inicio: cut.fecha_inicio,
    fecha_fin: cut.fecha_fin,
    estado_id: stateIds[cut.state],
    creado_en: new Date('2026-11-06T05:00:00.000Z'),
    cerrado_en: cut.cerrado_en ?? null,
    estados_corte: status(),
    usuarios_cortes_financieros_creado_porTousuarios: {
      id: ids.admin,
      nombre: 'Admin',
      apellido_paterno: 'Prueba',
      apellido_materno: null,
    },
    usuarios_cortes_financieros_cerrado_porTousuarios: null,
    _count: { detalle_corte: details.length, prenomina: 0 },
    detalle_corte: details.map((detail) => ({
      ...detail,
      pagos: payments.find((row) => row.id === detail.pago_id),
    })),
  });

  beforeEach(() => {
    payments = [
      payment(ids.payment, 'Validado', '1000.00'),
      payment(ids.otherPayment, 'Pendiente de revisión financiera', '250.00'),
    ];
    details = [];
    paymentReservations = [];
    periodReservations = [];
    history = [];
    cut = {
      id: ids.cut,
      numero_corte: 1,
      fecha_inicio: new Date('2026-11-06T05:00:00.000Z'),
      fecha_fin: new Date('2026-11-13T05:00:00.000Z'),
      state: 'En preparación',
      cerrado_en: null,
    };

    tx = {
      estados_corte: {
        findUnique: jest.fn(async ({ where }: any) =>
          where.nombre in stateIds
            ? { id: stateIds[where.nombre], nombre: where.nombre }
            : null,
        ),
      },
      cortes_financieros: {
        create: jest.fn(async ({ data }: any) => ({
          id: ids.cut,
          numero_corte: 1,
          ...data,
        })),
        findUnique: jest.fn(async () => ({
          ...cut,
          estado_id: stateIds[cut.state],
          estados_corte: status(),
        })),
        updateMany: jest.fn(async ({ where, data }: any) => {
          if (where.id !== cut.id || where.estado_id !== stateIds[cut.state])
            return { count: 0 };
          cut.state =
            Object.keys(stateIds).find(
              (name) => stateIds[name] === data.estado_id,
            ) ?? cut.state;
          if (data.cerrado_en) cut.cerrado_en = data.cerrado_en;
          return { count: 1 };
        }),
      },
      cortes_periodos_reservados: {
        create: jest.fn(async ({ data }: any) => {
          periodReservations.push(data);
          return data;
        }),
        deleteMany: jest.fn(async ({ where }: any) => {
          const before = periodReservations.length;
          periodReservations = periodReservations.filter(
            (row) => row.corte_id !== where.corte_id,
          );
          return { count: before - periodReservations.length };
        }),
      },
      cortes_pagos_reservados: {
        findMany: jest.fn(async ({ where }: any) =>
          paymentReservations.filter(
            (row) =>
              where.pago_id.in.includes(row.pago_id) &&
              (where.corte_id?.not
                ? row.corte_id !== where.corte_id.not
                : true),
          ),
        ),
        createMany: jest.fn(async ({ data }: any) => {
          paymentReservations.push(...data);
          return { count: data.length };
        }),
        deleteMany: jest.fn(async ({ where }: any) => {
          const before = paymentReservations.length;
          paymentReservations = paymentReservations.filter(
            (row) => row.corte_id !== where.corte_id,
          );
          return { count: before - paymentReservations.length };
        }),
      },
      pagos: {
        findMany: jest.fn(async ({ where }: any = {}) =>
          where?.estados_pago?.is?.nombre
            ? payments.filter(
                (row) =>
                  row.estados_pago?.nombre === where.estados_pago.is.nombre,
              )
            : payments,
        ),
      },
      detalle_corte: {
        createMany: jest.fn(async ({ data }: any) => {
          details.push(...data);
          return { count: data.length };
        }),
      },
      historial_estados_corte: {
        create: jest.fn(async ({ data }: any) => {
          history.push(data);
          return data;
        }),
        findMany: jest.fn(async () => history),
      },
    };
    prisma = {
      $transaction: jest.fn(async (callback: (transaction: any) => unknown) =>
        callback(tx),
      ),
      cortes_financieros: {
        findUnique: jest.fn(async ({ where }: any) =>
          where.id === cut.id ? fullCut() : null,
        ),
        findMany: jest.fn(async () => [fullCut()]),
        count: jest.fn(async () => 1),
      },
      pagos: tx.pagos,
      cortes_pagos_reservados: tx.cortes_pagos_reservados,
      historial_estados_corte: tx.historial_estados_corte,
    };
    service = new CortesFinancierosService(prisma as any);
  });

  it('creates a Cancun Friday-to-Friday exclusive period and reserves it', async () => {
    const created = await service.create(
      { periodo_inicio: '2026-11-06' },
      admin,
    );
    expect(created.folio).toBe('CF-2026-001');
    expect(tx.cortes_financieros.create.mock.calls[0][0].data).toMatchObject({
      fecha_inicio: new Date('2026-11-06T05:00:00.000Z'),
      fecha_fin: new Date('2026-11-13T05:00:00.000Z'),
      estado_id: stateIds['En preparación'],
      creado_por: ids.admin,
    });
    expect(periodReservations).toEqual([
      {
        periodo_inicio: new Date('2026-11-06T00:00:00.000Z'),
        corte_id: ids.cut,
      },
    ]);
    expect(history[0]).toMatchObject({
      estado_anterior_id: null,
      estado_nuevo_id: stateIds['En preparación'],
    });
  });

  it('rejects a period that does not start on Friday', async () => {
    await expect(
      service.create({ periodo_inicio: '2026-11-07' }, admin),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('previews validated payments separately from excluded payments and commissions', async () => {
    (payments[0] as any).comisiones.push({
      id: 'a9024f50-5e76-4e53-b6c3-05eac1bf2401',
      monto_base: new Prisma.Decimal('1000'),
      monto_comision: new Prisma.Decimal('100'),
      valor_aplicado: new Prisma.Decimal('10'),
      receptor_nombre_snapshot: 'Asesor Prueba',
      estado_id: 1,
      concepto_id: 1,
      conceptos_dispersion: {
        id: 1,
        nombre: 'Asesor',
        incluye_en_prenomina: true,
        es_remanente: false,
      },
      estados_comisiones: { id: 1, nombre: 'Pendiente de dispersión' },
    });
    const preview = await service.preview(ids.cut, admin);
    expect(preview.incluidos.cantidad).toBe(1);
    expect(preview.incluidos.total_ingresos).toBe('1000.00');
    expect(preview.excluidos.cantidad).toBe(1);
    expect(preview.excluidos.pagos[0].motivo).toContain(
      'Pendiente de revisión financiera',
    );
    expect(preview.comisiones_relacionadas.total_comisiones).toBe('100.00');
  });

  it('generates one immutable payment detail per eligible payment and opens the cut', async () => {
    await service.generate(ids.cut, { comentario: 'Revisado' }, admin);
    expect(paymentReservations).toEqual([
      { pago_id: ids.payment, corte_id: ids.cut },
    ]);
    expect(details).toEqual([
      {
        corte_id: ids.cut,
        pago_id: ids.payment,
        monto: new Prisma.Decimal('1000.00'),
      },
    ]);
    expect(cut.state).toBe('Abierto');
    expect(history.at(-1)).toMatchObject({
      estado_anterior_id: stateIds['En preparación'],
      estado_nuevo_id: stateIds.Abierto,
      comentario: 'Revisado',
    });
  });

  it('rolls back the open transition when a payment reservation conflicts', async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError(
      'unique violation',
      { code: 'P2002', clientVersion: 'unit-test' },
    );
    tx.cortes_pagos_reservados.createMany.mockRejectedValueOnce(duplicate);
    await expect(service.generate(ids.cut, {}, admin)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(cut.state).toBe('En preparación');
    expect(tx.cortes_financieros.updateMany).not.toHaveBeenCalled();
    expect(details).toHaveLength(0);
  });

  it('closes an open cut as a terminal state and records who closed it', async () => {
    cut.state = 'Abierto';
    await service.close(ids.cut, { comentario: 'Cierre aprobado' }, admin);
    expect(cut.state).toBe('Cerrado');
    expect(cut.cerrado_en).toBeInstanceOf(Date);
    expect(history.at(-1)).toMatchObject({
      estado_anterior_id: stateIds.Abierto,
      estado_nuevo_id: stateIds.Cerrado,
      cambiado_por: ids.admin,
      comentario: 'Cierre aprobado',
    });
  });

  it('cancels an open cut, releases reservations and preserves detail history', async () => {
    cut.state = 'Abierto';
    details.push({
      id: 'detail-1',
      corte_id: ids.cut,
      pago_id: ids.payment,
      monto: new Prisma.Decimal('1000.00'),
    });
    paymentReservations.push({ pago_id: ids.payment, corte_id: ids.cut });
    periodReservations.push({
      periodo_inicio: new Date('2026-11-06T00:00:00.000Z'),
      corte_id: ids.cut,
    });
    await service.cancel(
      ids.cut,
      { comentario: 'Se cancela para corregir' },
      admin,
    );
    expect(cut.state).toBe('Cancelado');
    expect(paymentReservations).toHaveLength(0);
    expect(periodReservations).toHaveLength(0);
    expect(details).toHaveLength(1);
    expect(history.at(-1)).toMatchObject({
      estado_anterior_id: stateIds.Abierto,
      estado_nuevo_id: stateIds.Cancelado,
    });
  });

  it('allows a payment to be reserved by a new cut after the previous cut is cancelled', async () => {
    cut.state = 'Abierto';
    details.push({ id: 'detail-old', corte_id: ids.cut, pago_id: ids.payment, monto: new Prisma.Decimal('1000.00') });
    paymentReservations.push({ pago_id: ids.payment, corte_id: ids.cut });
    periodReservations.push({ periodo_inicio: new Date('2026-11-06T00:00:00.000Z'), corte_id: ids.cut });
    await service.cancel(ids.cut, {}, admin);

    cut = {
      ...cut,
      id: 'a9cc02b6-9694-4caf-9081-2eb8fab95190',
      numero_corte: 2,
      state: 'En preparación',
    };
    await service.generate(cut.id, {}, admin);

    expect(paymentReservations).toEqual([{ pago_id: ids.payment, corte_id: cut.id }]);
    expect(details).toHaveLength(2);
    expect(details[0].corte_id).toBe(ids.cut);
    expect(details[1].corte_id).toBe(cut.id);
  });

  it('does not allow an advisor to access cut operations', async () => {
    await expect(
      service.findAll({ page: 1, limit: 20 }, advisor),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.cortes_financieros.findMany).not.toHaveBeenCalled();
  });
});
