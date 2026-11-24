import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { QueryClientesDto } from './dto/query-clientes.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { fechaIngresoActualPrisma, fechaPrisma } from './dto/cliente-validaciones';

type AuthenticatedUser = {
  id: string;
  roles: { nombre: string };
};

type ClientDependency = {
  tabla: string;
  columna: string;
  restriccion: string;
  on_delete: string;
  cantidad: number;
};

type ClientDependencyCatalogRow = {
  esquema: string;
  tabla: string;
  columna: string;
  restriccion: string;
  on_delete: string;
  columnas_clave: number;
};

const clienteListadoSelect = {
  id: true,
  pausado: true,
  nombre: true,
  apellido_paterno: true,
  apellido_materno: true,
  telefono: true,
  correo_electronico: true,
} as const;

const clienteDetalleFinancieroSelect = {
  ...clienteListadoSelect,
  fecha_ingreso: true,
  fecha_nacimiento: true,
} as const;

const clienteDetalleAdministrativoSelect = {
  ...clienteDetalleFinancieroSelect,
  curp: true,
  rfc: true,
  domicilio: true,
  referido_por: true,
  observaciones_generales: true,
} as const;

const clienteDetalleAdministradorSelect = {
  ...clienteDetalleAdministrativoSelect,
  asesor_id: true,
} as const;

@Injectable()
export class ClientesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryClientesDto, currentUser: AuthenticatedUser) {
    this.ensureCanRead(currentUser);
    const where = this.buildWhere(query, currentUser);
    const skip = (query.page - 1) * query.limit;

    const [data, total] = await Promise.all([
      this.prisma.clientes.findMany({
        where,
        select: {
          ...clienteListadoSelect,
          usuarios: {
            select: { nombre: true, apellido_paterno: true, apellido_materno: true },
          },
          contratos: {
            select: { servicios: { select: { nombre: true } } },
            orderBy: [{ servicio_id: 'asc' }, { id: 'asc' }],
          },
        },
        skip,
        take: query.limit,
        orderBy: [
          { apellido_paterno: 'asc' },
          { nombre: 'asc' },
          { id: 'asc' },
        ],
      }),
      this.prisma.clientes.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(id: string, currentUser: AuthenticatedUser) {
    this.ensureCanRead(currentUser);
    const where: Prisma.clientesWhereUniqueInput =
      currentUser.roles.nombre === 'asesor'
        ? { id, asesor_id: currentUser.id }
        : { id };

    const select =
      currentUser.roles.nombre === 'administrador'
        ? clienteDetalleAdministradorSelect
        : currentUser.roles.nombre === 'asesor'
          ? clienteDetalleAdministrativoSelect
          : clienteDetalleFinancieroSelect;

    const cliente = await this.prisma.clientes.findUnique({ where, select });

    if (!cliente) {
      throw new NotFoundException('Cliente no encontrado');
    }

    return cliente;
  }

  async create(
    createClienteDto: CreateClienteDto,
    currentUser: AuthenticatedUser,
  ) {
    await this.ensureActiveClientCreator(currentUser);

    try {
      const data = {
          nombre: createClienteDto.nombre,
          apellido_paterno: createClienteDto.apellido_paterno,
          apellido_materno: createClienteDto.apellido_materno,
          telefono: createClienteDto.telefono,
          correo_electronico: createClienteDto.correo_electronico,
          curp: createClienteDto.curp,
          rfc: createClienteDto.rfc,
          fecha_ingreso: fechaIngresoActualPrisma(),
          fecha_nacimiento: fechaPrisma(createClienteDto.fecha_nacimiento),
          domicilio: createClienteDto.domicilio,
          referido_por: createClienteDto.referido_por,
          observaciones_generales: createClienteDto.observaciones_generales,
          asesor_id: currentUser.roles.nombre === 'asesor' ? currentUser.id : null,
      };
      if (!createClienteDto.referido_por_cliente_id) {
        return await this.prisma.clientes.create({ data, select: clienteDetalleAdministrativoSelect });
      }
      await this.ensureReferralFeatureReady();
      return await this.prisma.$transaction(async (tx) => {
        const referidor = await tx.clientes.findUnique({
          where: { id: createClienteDto.referido_por_cliente_id! },
          select: { id: true, asesor_id: true },
        });
        if (!referidor || referidor.asesor_id !== currentUser.id) {
          throw new NotFoundException('Cliente referidor no disponible para el asesor');
        }
        const created = await tx.clientes.create({
          data: { ...data, referido_por_cliente_id: referidor.id },
          select: clienteDetalleAdministrativoSelect,
        });
        await tx.historial_referidor_cliente.create({
          data: { cliente_id: created.id, referidor_anterior_id: null, referidor_nuevo_id: referidor.id,
            actor_id: currentUser.id, motivo: 'Asignación inicial al registrar cliente' },
        });
        return created;
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async update(
    id: string,
    updateClienteDto: UpdateClienteDto,
    currentUser: AuthenticatedUser,
  ) {
    this.ensureCanUpdate(currentUser);

    const { fecha_nacimiento, ...otrosCampos } = updateClienteDto;
    const data = Object.fromEntries(
      Object.entries(otrosCampos).filter(([, value]) => value !== undefined),
    ) as Prisma.clientesUpdateManyMutationInput;
    if (fecha_nacimiento !== undefined) data.fecha_nacimiento = fechaPrisma(fecha_nacimiento);
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Debe proporcionar al menos un campo');
    }

    const where: Prisma.clientesWhereInput =
      currentUser.roles.nombre === 'asesor'
        ? { id, asesor_id: currentUser.id }
        : { id };

    try {
      const result = await this.prisma.clientes.updateMany({
        where,
        data,
      });

      if (result.count === 0) {
        throw new NotFoundException('Cliente no encontrado');
      }

      return await this.findOne(id, currentUser);
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async setPaused(
    id: string,
    pausado: boolean,
    currentUser: AuthenticatedUser,
  ) {
    if (
      !['administrador', 'administrador financiero'].includes(
        currentUser?.roles?.nombre,
      )
    ) {
      throw new ForbiddenException(
        'No tienes permiso para cambiar el estado operativo',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT "id" FROM "clientes" WHERE "id" = ${id}::uuid FOR UPDATE`,
      );
      if (rows.length === 0)
        throw new NotFoundException('Cliente no encontrado');

      return tx.clientes.update({
        where: { id },
        data: { pausado },
        select:
          currentUser.roles.nombre === 'administrador'
            ? clienteDetalleAdministradorSelect
            : clienteListadoSelect,
      });
    });
  }

  async setReferidor(id: string, referidorId: string | null | undefined, motivo: string, currentUser: AuthenticatedUser) {
    if (!['administrador', 'administrador financiero'].includes(currentUser.roles.nombre)) {
      throw new ForbiddenException('Solo administración puede cambiar el referidor');
    }
    if (referidorId === undefined) throw new BadRequestException('Debe indicar referidor_cliente_id o null');
    if (referidorId === id) throw new BadRequestException('Un cliente no puede referirse a sí mismo');
    await this.ensureReferralFeatureReady();
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT "id" FROM "clientes" WHERE "id" = ${id}::uuid FOR UPDATE`,
      );
      if (!locked.length) throw new NotFoundException('Cliente no encontrado');
      const current = await tx.clientes.findUniqueOrThrow({ where: { id }, select: { referido_por_cliente_id: true } });
      if (current.referido_por_cliente_id === referidorId) throw new ConflictException('El referidor ya tiene ese valor');
      if (referidorId && !await tx.clientes.findUnique({ where: { id: referidorId }, select: { id: true } })) {
        throw new NotFoundException('Cliente referidor no encontrado');
      }
      const updated = await tx.clientes.update({
        where: { id }, data: { referido_por_cliente_id: referidorId },
        select: { ...clienteDetalleAdministrativoSelect, referido_por_cliente_id: true },
      });
      await tx.historial_referidor_cliente.create({
        data: { cliente_id: id, referidor_anterior_id: current.referido_por_cliente_id,
          referidor_nuevo_id: referidorId, actor_id: currentUser.id, motivo },
      });
      return updated;
    });
  }

  async historialReferidor(id: string, currentUser: AuthenticatedUser) {
    if (!['administrador', 'administrador financiero'].includes(currentUser.roles.nombre)) {
      throw new ForbiddenException('Solo administración puede consultar este historial');
    }
    await this.ensureReferralFeatureReady();
    if (!await this.prisma.clientes.findUnique({ where: { id }, select: { id: true } })) {
      throw new NotFoundException('Cliente no encontrado');
    }
    return this.prisma.historial_referidor_cliente.findMany({
      where: { cliente_id: id }, orderBy: [{ fecha_cambio: 'desc' }, { id: 'desc' }],
      select: { id: true, referidor_anterior_id: true, referidor_nuevo_id: true,
        actor_id: true, motivo: true, fecha_cambio: true },
    });
  }

  async dependencies(id: string, currentUser: AuthenticatedUser) {
    this.ensureCanRetire(currentUser);
    return this.prisma.$transaction(async (tx) => {
      if (!await tx.clientes.findUnique({ where: { id }, select: { id: true } })) {
        throw new NotFoundException('Cliente no encontrado');
      }
      const direct = await this.clientDependencies(tx, id);
      return {
        cliente_id: id,
        apto_para_eliminacion: direct.every((item) => item.cantidad === 0),
        dependencias: direct,
        bloqueantes: direct.filter((item) => item.cantidad > 0),
        indirectas: await this.indirectDependencies(tx, id),
        advertencia: 'La previsualización no reserva el cliente; DELETE comprueba nuevamente las dependencias',
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async deleteWithoutDependencies(id: string, currentUser: AuthenticatedUser): Promise<void> {
    this.ensureCanRetire(currentUser);
    try {
      await this.prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`SELECT "id" FROM "clientes" WHERE "id"=${id}::uuid FOR UPDATE`,
        );
        if (!rows.length) throw new NotFoundException('Cliente no encontrado');
        const direct = await this.clientDependencies(tx, id);
        const blocking = direct.filter((item) => item.cantidad > 0);
        if (blocking.length) {
          throw new ConflictException({ codigo: 'CLIENTE_CON_DEPENDENCIAS', mensaje: 'El cliente conserva relaciones y no puede eliminarse', dependencias: blocking });
        }
        const audit = await tx.$queryRaw<Array<{ ready: boolean }>>(
          Prisma.sql`SELECT to_regclass('public.clientes_eliminaciones') IS NOT NULL AS ready`,
        );
        if (!audit[0]?.ready) {
          throw new ConflictException({ codigo: 'AUDITORIA_NO_DISPONIBLE', mensaje: 'La eliminación requiere la migración de auditoría' });
        }
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "clientes_eliminaciones" ("cliente_id","eliminado_por")
          VALUES (${id}::uuid,${currentUser.id}::uuid)
        `);
        await tx.clientes.delete({ where: { id } });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new ConflictException({ codigo: 'DEPENDENCIA_CONCURRENTE', mensaje: 'Una relación impide eliminar el cliente' });
      }
      throw error;
    }
  }

  private ensureCanRetire(user: AuthenticatedUser): void {
    if (!['administrador', 'administrador financiero'].includes(user?.roles?.nombre)) {
      throw new ForbiddenException('Solo administración puede consultar dependencias o retirar clientes');
    }
  }

  private async clientDependencies(db: Prisma.TransactionClient, id: string): Promise<ClientDependency[]> {
    const rows = await db.$queryRaw<ClientDependencyCatalogRow[]>(Prisma.sql`
      SELECT ns.nspname AS esquema, rel.relname AS tabla, att.attname AS columna, con.conname AS restriccion,
             CASE con.confdeltype WHEN 'c' THEN 'CASCADE' WHEN 'r' THEN 'RESTRICT'
               WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' ELSE 'NO ACTION' END AS on_delete,
             cardinality(con.conkey)::int AS columnas_clave
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid=con.conrelid
      JOIN pg_namespace ns ON ns.oid=rel.relnamespace
      JOIN pg_attribute att ON att.attrelid=rel.oid AND att.attnum=con.conkey[1]
      WHERE con.contype='f' AND con.confrelid='public.clientes'::regclass
      ORDER BY rel.relname,att.attname,con.conname
    `);
    const result: ClientDependency[] = [];
    for (const row of rows) {
      if (row.esquema !== 'public' || row.columnas_clave !== 1 || !/^[a-z_][a-z0-9_]*$/.test(row.tabla) || !/^[a-z_][a-z0-9_]*$/.test(row.columna)) {
        throw new ConflictException({ codigo: 'ESQUEMA_NO_COMPATIBLE', mensaje: 'Una relación de cliente requiere revisión antes de eliminar' });
      }
      const count = await db.$queryRaw<Array<{ cantidad: number }>>(Prisma.sql`
        SELECT COUNT(*)::int AS cantidad FROM ${Prisma.raw(`"public"."${row.tabla}"`)}
        WHERE ${Prisma.raw(`"${row.columna}"`)}=${id}::uuid
      `);
      result.push({ tabla: row.tabla, columna: row.columna, restriccion: row.restriccion,
        on_delete: row.on_delete, cantidad: count[0]?.cantidad ?? 0 });
    }
    return result;
  }

  private async indirectDependencies(db: Prisma.TransactionClient, id: string) {
    const rows = await db.$queryRaw<Array<{ pagos: number; programados: number; comisiones: number; evidencias: number; dispersiones: number; detalles_corte: number; cortes: number; prenominas: number }>>(Prisma.sql`
      SELECT
        (SELECT COUNT(*)::int FROM "pagos" p JOIN "contratos" ct ON ct."id"=p."contrato_id" WHERE ct."cliente_id"=${id}::uuid) AS pagos,
        (SELECT COUNT(*)::int FROM "pagos_programados" pp JOIN "contratos" ct ON ct."id"=pp."contrato_id" WHERE ct."cliente_id"=${id}::uuid) AS programados,
        (SELECT COUNT(*)::int FROM "comisiones" c JOIN "pagos" p ON p."id"=c."pago_id" JOIN "contratos" ct ON ct."id"=p."contrato_id" WHERE ct."cliente_id"=${id}::uuid) AS comisiones,
        (SELECT COUNT(*)::int FROM "evidencias_pago" e JOIN "pagos" p ON p."id"=e."pago_id" JOIN "contratos" ct ON ct."id"=p."contrato_id" WHERE ct."cliente_id"=${id}::uuid) AS evidencias,
        (SELECT COUNT(*)::int FROM "dispersiones_comision" d JOIN "comisiones" c ON c."id"=d."comision_id" JOIN "pagos" p ON p."id"=c."pago_id" JOIN "contratos" ct ON ct."id"=p."contrato_id" WHERE ct."cliente_id"=${id}::uuid) AS dispersiones,
        (SELECT COUNT(*)::int FROM "detalle_corte" dc JOIN "pagos" p ON p."id"=dc."pago_id" JOIN "contratos" ct ON ct."id"=p."contrato_id" WHERE ct."cliente_id"=${id}::uuid) AS detalles_corte,
        (SELECT COUNT(DISTINCT dc."corte_id")::int FROM "detalle_corte" dc JOIN "pagos" p ON p."id"=dc."pago_id" JOIN "contratos" ct ON ct."id"=p."contrato_id" WHERE ct."cliente_id"=${id}::uuid) AS cortes,
        (SELECT COUNT(DISTINCT pr."id")::int FROM "prenomina" pr JOIN "detalle_corte" dc ON dc."corte_id"=pr."corte_id" JOIN "pagos" p ON p."id"=dc."pago_id" JOIN "contratos" ct ON ct."id"=p."contrato_id" WHERE ct."cliente_id"=${id}::uuid) AS prenominas
    `);
    return rows[0];
  }

  private ensureCanRead(currentUser: AuthenticatedUser): void {
    if (
      !['administrador', 'administrador financiero', 'asesor'].includes(
        currentUser.roles.nombre,
      )
    ) {
      throw new ForbiddenException('No tienes acceso a clientes');
    }
  }

  private async ensureReferralFeatureReady(): Promise<void> {
    const rows = await this.prisma.$queryRaw<Array<{ ready: boolean }>>(
      Prisma.sql`SELECT to_regclass('public.historial_referidor_cliente') IS NOT NULL AS ready`,
    );
    if (!rows[0]?.ready) throw new ConflictException('La relación de referidores requiere la migración pendiente');
  }

  private ensureCanUpdate(currentUser: AuthenticatedUser): void {
    if (!['administrador', 'asesor'].includes(currentUser.roles.nombre)) {
      throw new ForbiddenException('No tienes acceso para modificar clientes');
    }
  }

  private async ensureActiveClientCreator(
    currentUser: AuthenticatedUser,
  ): Promise<void> {
    const allowedRoles = ['asesor', 'administrador', 'administrador financiero'];
    if (!allowedRoles.includes(currentUser.roles.nombre)) {
      throw new ForbiddenException('No tienes permiso para registrar clientes');
    }

    const user = await this.prisma.usuarios.findUnique({
      where: { id: currentUser.id },
      select: {
        activo: true,
        roles: { select: { nombre: true } },
      },
    });

    if (!user || !user.activo) {
      throw new UnauthorizedException('La sesión del usuario no es válida');
    }

    if (!allowedRoles.includes(user.roles.nombre) || user.roles.nombre !== currentUser.roles.nombre) {
      throw new ForbiddenException('No tienes permiso para registrar clientes');
    }
  }

  private buildWhere(
    query: QueryClientesDto,
    currentUser: AuthenticatedUser,
  ): Prisma.clientesWhereInput {
    const where: Prisma.clientesWhereInput = {};

    if (currentUser.roles.nombre === 'asesor') {
      where.asesor_id = currentUser.id;
    }

    const search = query.q?.trim();
    if (search) {
      where.OR = [
        { nombre: { contains: search, mode: 'insensitive' } },
        { apellido_paterno: { contains: search, mode: 'insensitive' } },
        { apellido_materno: { contains: search, mode: 'insensitive' } },
        { correo_electronico: { contains: search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private handlePrismaError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2000') {
        throw new BadRequestException(
          'Uno o más campos exceden la longitud permitida',
        );
      }

      if (error.code === 'P2003') {
        throw new BadRequestException('Una referencia proporcionada no existe');
      }

      if (error.code === 'P2025') {
        throw new NotFoundException('Cliente no encontrado');
      }
    }

    throw error;
  }
}
