import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';

export const MODALIDADES = ['modalidad_10', 'modalidad_40', 'modalidad_40_retroactiva'] as const;
export type Modalidad = (typeof MODALIDADES)[number];
export interface UsuarioModalidades { id: string; roles: { nombre: string } }
export const CAMPOS = {
  modalidad_10: { aplica: 'aplica_m10', fase: 'fase_m10_id', estatus: 'estatus_m10_id', paso: 5, etapa: 'Estrategia Modalidad 10' },
  modalidad_40: { aplica: 'aplica_m40', fase: 'fase_m40_id', estatus: 'estatus_m40_id', paso: 6, etapa: 'Estrategia Modalidad 40' },
  modalidad_40_retroactiva: { aplica: 'aplica_m40r', fase: 'fase_m40r_id', estatus: 'estatus_m40r_id', paso: 7, etapa: 'Modalidad 40 retroactiva' },
} as const;
export const FASES = ['Prospecto', 'Documentación', 'En análisis', 'Cotización', 'Autorizado'];

export function assertAsesor(user: UsuarioModalidades) {
  if (user.roles?.nombre !== 'asesor') throw new ForbiddenException('Operación exclusiva del asesor');
}
export function modalidadValida(value: string): Modalidad {
  if (!MODALIDADES.includes(value as Modalidad)) throw new BadRequestException('Modalidad individual inválida');
  return value as Modalidad;
}
export function validarSeleccion(values: readonly string[]) {
  if (!Array.isArray(values) || values.length < 1 || values.length > 2 || new Set(values).size !== values.length) {
    throw new BadRequestException('Seleccione una o dos modalidades sin duplicados');
  }
  values.forEach(modalidadValida);
  if (values.includes('modalidad_10') && values.includes('modalidad_40')) throw new BadRequestException('M10 y M40 no pueden coexistir');
  return values.length === 2 ? 'mixto' as const : modalidadValida(values[0]);
}
export function seleccionActual(row: { aplica_m10: boolean; aplica_m40: boolean; aplica_m40r: boolean }) {
  return MODALIDADES.filter((m) => row[CAMPOS[m].aplica]);
}
export function validarFases(rows: { nombre: string; orden: number }[]) {
  if (rows.length !== 5 || rows.some((f, i) => f.nombre !== FASES[i] || f.orden !== i + 1)) {
    throw new ConflictException('El catálogo de fases no coincide con las cinco fases documentadas');
  }
}
export function modalidadDeEtapa(etapa: { numero_paso: number; nombre: string }): Modalidad | null {
  return MODALIDADES.find((m) => CAMPOS[m].paso === etapa.numero_paso && CAMPOS[m].etapa === etapa.nombre) ?? null;
}
export function hoyCancun(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Cancun', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function clasificarFecha(fecha: Date, now = new Date()): 'vencido' | 'hoy' | 'futuro' {
  const day = fecha.toISOString().slice(0, 10), today = hoyCancun(now);
  return day < today ? 'vencido' : day === today ? 'hoy' : 'futuro';
}
export function clasificarEvento(fecha: Date, hora: Date | null, now = new Date()): 'vencido' | 'hoy' | 'futuro' {
  if (!hora) return clasificarFecha(fecha, now);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Cancun', hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  const localNow = `${hoyCancun(now)}T${part('hour')}:${part('minute')}:${part('second')}`;
  const eventoCivil = `${fecha.toISOString().slice(0, 10)}T${hora.toISOString().slice(11, 19)}`;
  return eventoCivil < localNow ? 'vencido' : 'futuro';
}
