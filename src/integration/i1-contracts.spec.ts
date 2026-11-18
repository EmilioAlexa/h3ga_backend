import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { LoginDto } from '../auth/dto/login.dto';
import { CreateClienteDto } from '../clientes/dto/create-cliente.dto';
import { QueryClientesDto } from '../clientes/dto/query-clientes.dto';
import { CreateContratoDto } from '../finanzas/contratos/dto/create-contrato.dto';
import { CreatePagoDto } from '../finanzas/pagos/dto/create-pago.dto';
import { QueryPagosDto } from '../finanzas/pagos/dto/query-pagos.dto';
import { QueryCatalogosDto } from '../finanzas/catalogos/dto/query-catalogos.dto';
import { Prisma } from '../generated/prisma/client';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});
const uuid = 'caf2c963-4531-4998-80d8-655cb904d192';

async function body<T extends object>(value: object, metatype: new () => T) {
  return pipe.transform(value, { type: 'body', metatype });
}

async function query<T extends object>(value: object, metatype: new () => T) {
  return pipe.transform(value, { type: 'query', metatype });
}

describe('I1: contratos DTO en el borde HTTP, sin base de datos', () => {
  it('acepta el login esperado por Flutter y rechaza campos ajenos', async () => {
    const valid = await body(
      { correo_electronico: 'persona@example.test', contrasena: 'Clave1234' },
      LoginDto,
    );
    expect(valid.correo_electronico).toBe('persona@example.test');
    await expect(
      body(
        {
          correo_electronico: 'persona@example.test',
          contrasena: 'Clave1234',
          rol_id: 1,
        },
        LoginDto,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('demuestra que el payload completo de ClienteModel requiere seleccionar campos', async () => {
    await expect(
      body(
        {
          nombre: 'Ana',
          apellido_paterno: 'Prueba',
          asesor_id: uuid,
          fecha_ingreso: null,
          direccion: null,
        },
        CreateClienteDto,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    const valid = await body(
      { nombre: ' Ana ', apellido_paterno: ' Prueba ', apellido_materno: null },
      CreateClienteDto,
    );
    expect(valid.nombre).toBe('Ana');
    expect(valid.apellido_paterno).toBe('Prueba');
  });

  it('aplica límites y valores por defecto al listado de clientes', async () => {
    const defaults = await query({}, QueryClientesDto);
    expect(defaults.page).toBe(1);
    expect(defaults.limit).toBe(20);
    const paged = await query({ page: '2', limit: '5', q: ' Ana ' }, QueryClientesDto);
    expect([paged.page, paged.limit, paged.q]).toEqual([2, 5, 'Ana']);
    await expect(query({ limit: '101' }, QueryClientesDto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('acepta contrato con fecha local y rechaza atributos visuales extra', async () => {
    const request = {
      cliente_id: uuid,
      servicio_id: 1,
      folio: 'CONTRATO-TEST',
      fecha_contrato: '2026-11-16',
      estado_contrato_id: 1,
    };
    const valid = await body(request, CreateContratoDto);
    expect(valid.fecha_contrato).toBeInstanceOf(Date);
    await expect(
      body({ ...request, totalPagar: '100.00' }, CreateContratoDto),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('exige monto como cadena de hasta dos decimales en pagos', async () => {
    const request = {
      contrato_id: uuid,
      forma_pago_id: 1,
      monto: '1250.50',
      fecha_pago: '2026-11-16T12:00:00.000Z',
    };
    const valid = await body(request, CreatePagoDto);
    expect(valid.monto).toBe('1250.50');
    expect(valid.fecha_pago).toBeInstanceOf(Date);
    await expect(body({ ...request, monto: 1250.5 }, CreatePagoDto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(body({ ...request, monto: '1250.500' }, CreatePagoDto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('valida los filtros paginados y booleanos de pagos y catálogos', async () => {
    const payments = await query({ page: '2', limit: '5' }, QueryPagosDto);
    expect([payments.page, payments.limit]).toEqual([2, 5]);
    const catalog = await query({ activo: 'false' }, QueryCatalogosDto);
    expect(catalog.activo).toBe(false);
    await expect(query({ activo: 'no' }, QueryCatalogosDto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('serializa Decimal monetario como string y fecha como ISO', () => {
    const json = JSON.parse(
      JSON.stringify({ monto: new Prisma.Decimal('1250.50'), fecha_pago: new Date('2026-11-16T12:00:00.000Z') }),
    ) as { monto: string; fecha_pago: string };
    expect(json).toEqual({ monto: '1250.5', fecha_pago: '2026-11-16T12:00:00.000Z' });
  });
});
