import { ScheduledPaymentBalance } from './scheduled-payment-balance';

export type OperationalScheduledState = 'Pendiente' | 'Cubierto' | 'Vencido' | 'Cancelado' | null;

export function cancunToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Cancun', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const field = (name: string) => parts.find((part) => part.type === name)?.value;
  return `${field('year')}-${field('month')}-${field('day')}`;
}

export function operationalScheduledState(
  persistedName: string | null,
  dueDate: Date | null,
  balance: ScheduledPaymentBalance,
  today = cancunToday(),
): OperationalScheduledState {
  if (persistedName === 'Cancelado') return 'Cancelado';
  if (balance.saldo_pendiente_confirmado === null) return null;
  if (balance.saldo_pendiente_confirmado === '0.00') return 'Cubierto';
  if (!dueDate) return null;
  return dueDate.toISOString().slice(0, 10) < today ? 'Vencido' : 'Pendiente';
}
