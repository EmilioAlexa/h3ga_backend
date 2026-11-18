import { Prisma } from '../../generated/prisma/client';
import { scheduledPaymentBalance } from './scheduled-payment-balance';

const payment = (amount: string, state: string) => ({
  monto: new Prisma.Decimal(amount),
  estados_pago: { nombre: state },
});

describe('saldo confirmado de una obligación', () => {
  it('conserva el importe íntegro cuando no hay abonos y llega a cero con varios validados', () => {
    const base = { monto_esperado: new Prisma.Decimal('100.00'), estados_pago_programado: null };
    expect(scheduledPaymentBalance({ ...base, pagos: [] })).toEqual({
      monto_abonado_validado: '0.00', saldo_pendiente_confirmado: '100.00', motivo_saldo_no_disponible: null,
    });
    expect(scheduledPaymentBalance({ ...base, pagos: [
      payment('40.10', 'Validado'), payment('59.90', 'Validado'),
    ] })).toEqual({
      monto_abonado_validado: '100.00', saldo_pendiente_confirmado: '0.00', motivo_saldo_no_disponible: null,
    });
  });

  it('excluye revisión, autorización, rechazo y cancelación del abono validado', () => {
    const result = scheduledPaymentBalance({
      monto_esperado: '100.00', estados_pago_programado: null,
      pagos: [
        payment('10.00', 'Validado'), payment('20.00', 'Pendiente de revisión financiera'),
        payment('30.00', 'Pendiente de autorización'), payment('40.00', 'Rechazado'),
        payment('50.00', 'Cancelado'),
      ],
    });
    expect(result).toEqual({
      monto_abonado_validado: '10.00', saldo_pendiente_confirmado: '90.00', motivo_saldo_no_disponible: null,
    });
  });

  it('no publica saldos negativos, cancelados ni basados en importe desconocido', () => {
    expect(scheduledPaymentBalance({ monto_esperado: '100.00', estados_pago_programado: null,
      pagos: [payment('101.00', 'Validado')] })).toMatchObject({
      saldo_pendiente_confirmado: null, motivo_saldo_no_disponible: 'SOBREPAGO',
    });
    expect(scheduledPaymentBalance({ monto_esperado: null, estados_pago_programado: null,
      pagos: [] })).toMatchObject({
      saldo_pendiente_confirmado: null, motivo_saldo_no_disponible: 'IMPORTE_NO_DEFINIDO',
    });
    expect(scheduledPaymentBalance({ monto_esperado: '100.00', estados_pago_programado: { nombre: 'Cancelado' },
      pagos: [] })).toMatchObject({
      saldo_pendiente_confirmado: null, motivo_saldo_no_disponible: 'CANCELADO',
    });
  });
});
