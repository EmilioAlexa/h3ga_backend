import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BajaSolicitudDto, CambiarServicioDto, CrearAlertaDto, CrearSolicitudDto, CrearSolicitudPersonalizadaDto, QuerySolicitudesDto, SeguimientoDto, VincularDocumentoDto } from './servicios-complementarios.dto';

describe('Validación de DTO de servicios complementarios', () => {
  const options = { whitelist: true, forbidNonWhitelisted: true };
  it('rechaza identificadores inválidos y servicio fuera de rango', async () => {
    expect((await validate(plainToInstance(CrearSolicitudDto, { cliente_id: 'no-uuid', servicio_id: 0 }), options)).length).toBe(2);
    expect((await validate(plainToInstance(VincularDocumentoDto, { documento_id: 'no-uuid' }), options)).length).toBeGreaterThan(0);
  });
  it('exige confirmación booleana explícita', async () => {
    for (const confirmar of [false, 'true', null, undefined]) {
      expect((await validate(plainToInstance(CambiarServicioDto, { servicio_id: 1, confirmar }), options)).length).toBeGreaterThan(0);
    }
    expect(await validate(plainToInstance(CambiarServicioDto, { servicio_id: 1, confirmar: true }), options)).toHaveLength(0);
  });
  it('rechaza avance arbitrario, fecha inválida y paginación excesiva', async () => {
    expect((await validate(plainToInstance(SeguimientoDto, { avance_porcentaje: 60, fecha_compromiso: '2026-02-30' }), options)).length).toBeGreaterThanOrEqual(2);
    expect((await validate(plainToInstance(QuerySolicitudesDto, { limit: '101', page: '0' }), options)).length).toBe(2);
  });
  it('valida nombre y descripción personalizados', async () => {
    const dto = plainToInstance(CrearSolicitudPersonalizadaDto, { cliente_id: '22222222-2222-4222-8222-222222222222', nombre: '   ', descripcion: '' });
    expect((await validate(dto, options)).length).toBe(2);
    const valido = plainToInstance(CrearSolicitudPersonalizadaDto, { cliente_id: '22222222-2222-4222-8222-222222222222', nombre: '  Otro  ', descripcion: '  descripción  ' });
    expect(await validate(valido, options)).toHaveLength(0);
    expect(valido.nombre).toBe('Otro');
  });
  it('exige confirmación de baja y alerta con fecha y motivo válidos', async () => {
    expect((await validate(plainToInstance(BajaSolicitudDto, { confirmar: false }), options)).length).toBeGreaterThan(0);
    expect((await validate(plainToInstance(CrearAlertaDto, { motivo: ' ', fecha: '2026-02-30', asesor_id: 'ajeno' }), options)).length).toBeGreaterThanOrEqual(3);
    expect(await validate(plainToInstance(CrearAlertaDto, { motivo: ' Llamar ', fecha: '2026-12-01' }), options)).toHaveLength(0);
  });
});
