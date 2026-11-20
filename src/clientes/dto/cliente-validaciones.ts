import { ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';

// Validación estructural; no consulta ni acredita la identidad ante RENAPO o SAT.
export const CURP_FORMATO = /^[A-ZÑ]{4}\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[HM][A-Z]{5}[A-Z0-9]\d$/;
export const RFC_FORMATO = /^[A-ZÑ&]{3,4}\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[A-Z0-9]{3}$/;

@ValidatorConstraint({ name: 'fechaCalendario', async: false })
export class FechaCalendario implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    if (year < 1) return false;
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    date.setUTCHours(0, 0, 0, 0);
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }
  defaultMessage(): string { return 'Debe ser una fecha válida con formato AAAA-MM-DD'; }
}

@ValidatorConstraint({ name: 'nacimientoNoFuturo', async: false })
export class NacimientoNoFuturo implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Cancun', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
    return value <= `${part('year')}-${part('month')}-${part('day')}`;
  }
  defaultMessage(): string { return 'La fecha de nacimiento no puede ser futura'; }
}

export function fechaPrisma(value: string | null | undefined): Date | null | undefined {
  return value == null ? value : new Date(`${value}T00:00:00.000Z`);
}

/**
 * `clientes.fecha_ingreso` es una fecha civil de negocio, no una marca de
 * auditoría. Se calcula en la zona operativa para que PostgreSQL @db.Date no
 * cambie de día al serializarla.
 */
export function fechaIngresoActualPrisma(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Cancun',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return new Date(`${part('year')}-${part('month')}-${part('day')}T00:00:00.000Z`);
}
