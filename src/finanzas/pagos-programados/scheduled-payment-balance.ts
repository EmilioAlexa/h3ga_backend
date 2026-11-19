import { Prisma } from '../../generated/prisma/client';

type Money = Prisma.Decimal | string;

export type ScheduledPaymentBalanceInput = {
  monto_esperado: Money | null;
  estados_pago_programado: { nombre: string } | null;
  pagos: { monto: Money; estados_pago: { nombre: string } | null }[];
};

export type ScheduledPaymentBalance = {
  monto_abonado_validado: string;
  saldo_pendiente_confirmado: string | null;
  motivo_saldo_no_disponible: 'CANCELADO' | 'IMPORTE_NO_DEFINIDO' | 'IMPORTE_INVALIDO' | 'SOBREPAGO' | null;
};

export function scheduledPaymentBalance(input: ScheduledPaymentBalanceInput): ScheduledPaymentBalance {
  const validated = input.pagos.reduce(
    (sum, pago) => pago.estados_pago?.nombre === 'Validado'
      ? sum.plus(new Prisma.Decimal(pago.monto))
      : sum,
    new Prisma.Decimal(0),
  );
  const base = { monto_abonado_validado: validated.toFixed(2) };
  if (input.estados_pago_programado?.nombre === 'Cancelado') {
    return { ...base, saldo_pendiente_confirmado: null, motivo_saldo_no_disponible: 'CANCELADO' };
  }
  if (input.monto_esperado === null) {
    return { ...base, saldo_pendiente_confirmado: null, motivo_saldo_no_disponible: 'IMPORTE_NO_DEFINIDO' };
  }
  const expected = new Prisma.Decimal(input.monto_esperado);
  if (!expected.isFinite() || expected.lt(0)) {
    return { ...base, saldo_pendiente_confirmado: null, motivo_saldo_no_disponible: 'IMPORTE_INVALIDO' };
  }
  if (validated.gt(expected)) {
    return { ...base, saldo_pendiente_confirmado: null, motivo_saldo_no_disponible: 'SOBREPAGO' };
  }
  return {
    ...base,
    saldo_pendiente_confirmado: expected.minus(validated).toFixed(2),
    motivo_saldo_no_disponible: null,
  };
}
