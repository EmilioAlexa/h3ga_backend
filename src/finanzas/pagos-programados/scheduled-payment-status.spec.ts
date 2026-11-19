import { operationalScheduledState, cancunToday } from './scheduled-payment-status';

const balance = (amount: string | null) => ({
  monto_abonado_validado: '0.00', saldo_pendiente_confirmado: amount,
  motivo_saldo_no_disponible: null,
});

describe('estado operativo de una obligación', () => {
  it('usa la fecha local de Cancún y no declara vencido el día del vencimiento', () => {
    expect(cancunToday(new Date('2026-11-18T04:59:59.000Z'))).toBe('2026-11-17');
    expect(cancunToday(new Date('2026-11-18T05:00:00.000Z'))).toBe('2026-11-18');
    expect(operationalScheduledState(null, new Date('2026-11-18'), balance('10.00'), '2026-11-18')).toBe('Pendiente');
    expect(operationalScheduledState(null, new Date('2026-11-17'), balance('10.00'), '2026-11-18')).toBe('Vencido');
  });

  it('prioriza cancelación y cobertura total sobre la fecha pasada', () => {
    expect(operationalScheduledState('Cancelado', new Date('2000-01-01'), balance('10.00'), '2026-11-18')).toBe('Cancelado');
    expect(operationalScheduledState(null, new Date('2000-01-01'), balance('0.00'), '2026-11-18')).toBe('Cubierto');
  });

  it('no inventa estado para fecha ausente o saldo anómalo', () => {
    expect(operationalScheduledState(null, null, balance('10.00'), '2026-11-18')).toBeNull();
    expect(operationalScheduledState(null, new Date('2000-01-01'), balance(null), '2026-11-18')).toBeNull();
  });
});
