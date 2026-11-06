import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CatalogoFinancieroDto } from './dto/catalogo-financiero.dto';
import { QueryCatalogosDto } from './dto/query-catalogos.dto';

const CATALOGOS = [
  'servicios',
  'estados-contrato',
  'formas-pago',
  'estados-pago',
  'estados-pago-programado',
  'tipos-cobro',
  'tipos-evidencia-pago',
  'estados-comision',
  'conceptos-dispersion',
  'estados-corte',
  'estados-prenomina',
  'tipos-asesor',
  'esquemas-dispersion',
] as const;

type Catalogo = (typeof CATALOGOS)[number];
type UsuarioAutenticado = { id: string; roles: { nombre: string } };

const ROLES_ADMINISTRATIVOS = [
  'administrador',
  'administrador financiero',
];

const CATALOGOS_SOLO_ADMINISTRATIVOS: Catalogo[] = [
  'estados-comision',
  'conceptos-dispersion',
  'estados-corte',
  'estados-prenomina',
  'tipos-asesor',
  'esquemas-dispersion',
];

const CATALOGOS_CON_ACTIVO = new Set<Catalogo>([
  'servicios',
  'formas-pago',
  'tipos-cobro',
  'tipos-asesor',
]);

const MUTABLES: Record<string, readonly string[]> = {
  servicios: ['nombre', 'descripcion', 'activo'],
  'formas-pago': ['nombre', 'activo'],
  'tipos-cobro': ['nombre', 'descripcion', 'activo'],
  'tipos-evidencia-pago': ['nombre', 'descripcion'],
  'tipos-asesor': ['nombre', 'descripcion', 'activo'],
};

@Injectable()
export class CatalogosService {
  constructor(private readonly prisma: PrismaService) {}

  getCatalogos(usuario: UsuarioAutenticado) {
    this.ensureAuthenticatedRole(usuario);
    return CATALOGOS.filter(
      (catalogo) =>
        !CATALOGOS_SOLO_ADMINISTRATIVOS.includes(catalogo) ||
        ROLES_ADMINISTRATIVOS.includes(usuario.roles.nombre),
    ).map((clave) => ({
      clave,
      editable:
        ROLES_ADMINISTRATIVOS.includes(usuario.roles.nombre) &&
        Object.prototype.hasOwnProperty.call(MUTABLES, clave),
      permite_desactivar:
        ROLES_ADMINISTRATIVOS.includes(usuario.roles.nombre) &&
        CATALOGOS_CON_ACTIVO.has(clave),
      solo_administracion: CATALOGOS_SOLO_ADMINISTRATIVOS.includes(clave),
    }));
  }

  async findAll(
    catalogoParam: string,
    query: QueryCatalogosDto,
    usuario: UsuarioAutenticado,
  ) {
    const catalogo = this.getCatalogo(catalogoParam);
    this.ensureCanRead(catalogo, usuario);

    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;
    const q = query.q?.trim();
    const activeFilter = this.buildActiveFilter(catalogo, query, usuario);

    let data: unknown[] = [];
    let total = 0;

    switch (catalogo) {
      case 'servicios': {
        const where: Prisma.serviciosWhereInput = {
          ...(q ? { nombre: { contains: q, mode: 'insensitive' } } : {}),
          ...activeFilter,
        };
        [data, total] = await Promise.all([
          this.prisma.servicios.findMany({
            where,
            select: { id: true, nombre: true, descripcion: true, activo: true },
            orderBy: { nombre: 'asc' },
            skip,
            take: limit,
          }),
          this.prisma.servicios.count({ where }),
        ]);
        break;
      }
      case 'estados-contrato': {
        const where: Prisma.estados_contratosWhereInput = q
          ? { nombre: { contains: q, mode: 'insensitive' } }
          : {};
        [data, total] = await Promise.all([
          this.prisma.estados_contratos.findMany({
            where,
            select: { id: true, nombre: true, descripcion: true, orden: true },
            orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
            skip,
            take: limit,
          }),
          this.prisma.estados_contratos.count({ where }),
        ]);
        break;
      }
      case 'formas-pago': {
        const where: Prisma.formas_pagoWhereInput = {
          ...(q ? { nombre: { contains: q, mode: 'insensitive' } } : {}),
          ...activeFilter,
        };
        [data, total] = await Promise.all([
          this.prisma.formas_pago.findMany({
            where,
            select: { id: true, nombre: true, activo: true },
            orderBy: { nombre: 'asc' },
            skip,
            take: limit,
          }),
          this.prisma.formas_pago.count({ where }),
        ]);
        break;
      }
      case 'estados-pago': {
        const where: Prisma.estados_pagoWhereInput = q
          ? { nombre: { contains: q, mode: 'insensitive' } }
          : {};
        [data, total] = await Promise.all([
          this.prisma.estados_pago.findMany({
            where,
            select: { id: true, nombre: true, orden: true },
            orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
            skip,
            take: limit,
          }),
          this.prisma.estados_pago.count({ where }),
        ]);
        break;
      }
      case 'estados-pago-programado': {
        const where: Prisma.estados_pago_programadoWhereInput = q
          ? { nombre: { contains: q, mode: 'insensitive' } }
          : {};
        [data, total] = await Promise.all([
          this.prisma.estados_pago_programado.findMany({
            where,
            select: { id: true, nombre: true, descripcion: true },
            orderBy: { nombre: 'asc' },
            skip,
            take: limit,
          }),
          this.prisma.estados_pago_programado.count({ where }),
        ]);
        break;
      }
      case 'tipos-cobro': {
        const where: Prisma.tipos_cobroWhereInput = {
          ...(q ? { nombre: { contains: q, mode: 'insensitive' } } : {}),
          ...activeFilter,
        };
        [data, total] = await Promise.all([
          this.prisma.tipos_cobro.findMany({
            where,
            select: { id: true, nombre: true, descripcion: true, activo: true },
            orderBy: { nombre: 'asc' },
            skip,
            take: limit,
          }),
          this.prisma.tipos_cobro.count({ where }),
        ]);
        break;
      }
      case 'tipos-evidencia-pago': {
        const where: Prisma.tipos_evidencia_pagoWhereInput = q
          ? { nombre: { contains: q, mode: 'insensitive' } }
          : {};
        [data, total] = await Promise.all([
          this.prisma.tipos_evidencia_pago.findMany({
            where,
            select: { id: true, nombre: true, descripcion: true },
            orderBy: { nombre: 'asc' },
            skip,
            take: limit,
          }),
          this.prisma.tipos_evidencia_pago.count({ where }),
        ]);
        break;
      }
      case 'estados-comision': {
        const where: Prisma.estados_comisionesWhereInput = q
          ? { nombre: { contains: q, mode: 'insensitive' } }
          : {};
        [data, total] = await Promise.all([
          this.prisma.estados_comisiones.findMany({
            where,
            select: { id: true, nombre: true, descripcion: true },
            orderBy: { nombre: 'asc' },
            skip,
            take: limit,
          }),
          this.prisma.estados_comisiones.count({ where }),
        ]);
        break;
      }
      case 'conceptos-dispersion': {
        const where: Prisma.conceptos_dispersionWhereInput = {
          ...(q ? { nombre: { contains: q, mode: 'insensitive' } } : {}),
          ...(query.activo === undefined ? {} : { activo: query.activo }),
        };
        [data, total] = await Promise.all([
          this.prisma.conceptos_dispersion.findMany({
            where,
            select: {
              id: true,
              nombre: true,
              descripcion: true,
              tipo_destino: true,
              incluye_en_prenomina: true,
              es_remanente: true,
              orden: true,
              activo: true,
            },
            orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
            skip,
            take: limit,
          }),
          this.prisma.conceptos_dispersion.count({ where }),
        ]);
        break;
      }
      case 'estados-corte': {
        const where: Prisma.estados_corteWhereInput = q
          ? { nombre: { contains: q, mode: 'insensitive' } }
          : {};
        [data, total] = await Promise.all([
          this.prisma.estados_corte.findMany({
            where,
            select: { id: true, nombre: true, descripcion: true },
            orderBy: { nombre: 'asc' },
            skip,
            take: limit,
          }),
          this.prisma.estados_corte.count({ where }),
        ]);
        break;
      }
      case 'estados-prenomina': {
        const where: Prisma.estados_prenominaWhereInput = q
          ? { nombre: { contains: q, mode: 'insensitive' } }
          : {};
        [data, total] = await Promise.all([
          this.prisma.estados_prenomina.findMany({
            where,
            select: { id: true, nombre: true, descripcion: true },
            orderBy: { nombre: 'asc' },
            skip,
            take: limit,
          }),
          this.prisma.estados_prenomina.count({ where }),
        ]);
        break;
      }
      case 'tipos-asesor': {
        const where: Prisma.tipos_asesorWhereInput = {
          ...(q ? { nombre: { contains: q, mode: 'insensitive' } } : {}),
          ...activeFilter,
        };
        [data, total] = await Promise.all([
          this.prisma.tipos_asesor.findMany({
            where,
            select: { id: true, nombre: true, descripcion: true, activo: true },
            orderBy: { nombre: 'asc' },
            skip,
            take: limit,
          }),
          this.prisma.tipos_asesor.count({ where }),
        ]);
        break;
      }
      case 'esquemas-dispersion': {
        const where: Prisma.esquemas_dispersionWhereInput = {
          ...(q ? { nombre: { contains: q, mode: 'insensitive' } } : {}),
          ...(query.activo === undefined ? {} : { activo: query.activo }),
        };
        [data, total] = await Promise.all([
          this.prisma.esquemas_dispersion.findMany({
            where,
            select: {
              id: true,
              nombre: true,
              descripcion: true,
              servicio_id: true,
              tipo_asesor_id: true,
              activo: true,
            },
            orderBy: { nombre: 'asc' },
            skip,
            take: limit,
          }),
          this.prisma.esquemas_dispersion.count({ where }),
        ]);
        break;
      }
    }

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(
    catalogoParam: string,
    idParam: string,
    usuario: UsuarioAutenticado,
  ) {
    const catalogo = this.getCatalogo(catalogoParam);
    this.ensureCanRead(catalogo, usuario);
    const id = this.parseId(idParam);
    let registro: unknown;

    switch (catalogo) {
      case 'servicios':
        registro = await this.prisma.servicios.findUnique({
          where: { id },
          select: { id: true, nombre: true, descripcion: true, activo: true },
        });
        break;
      case 'estados-contrato':
        registro = await this.prisma.estados_contratos.findUnique({
          where: { id },
          select: { id: true, nombre: true, descripcion: true, orden: true },
        });
        break;
      case 'formas-pago':
        registro = await this.prisma.formas_pago.findUnique({
          where: { id },
          select: { id: true, nombre: true, activo: true },
        });
        break;
      case 'estados-pago':
        registro = await this.prisma.estados_pago.findUnique({
          where: { id },
          select: { id: true, nombre: true, orden: true },
        });
        break;
      case 'estados-pago-programado':
        registro = await this.prisma.estados_pago_programado.findUnique({
          where: { id },
          select: { id: true, nombre: true, descripcion: true },
        });
        break;
      case 'tipos-cobro':
        registro = await this.prisma.tipos_cobro.findUnique({
          where: { id },
          select: { id: true, nombre: true, descripcion: true, activo: true },
        });
        break;
      case 'tipos-evidencia-pago':
        registro = await this.prisma.tipos_evidencia_pago.findUnique({
          where: { id },
          select: { id: true, nombre: true, descripcion: true },
        });
        break;
      case 'estados-comision':
        registro = await this.prisma.estados_comisiones.findUnique({
          where: { id },
          select: { id: true, nombre: true, descripcion: true },
        });
        break;
      case 'conceptos-dispersion':
        registro = await this.prisma.conceptos_dispersion.findUnique({
          where: { id },
          select: {
            id: true,
            nombre: true,
            descripcion: true,
            tipo_destino: true,
            incluye_en_prenomina: true,
            es_remanente: true,
            orden: true,
            activo: true,
          },
        });
        break;
      case 'estados-corte':
        registro = await this.prisma.estados_corte.findUnique({
          where: { id },
          select: { id: true, nombre: true, descripcion: true },
        });
        break;
      case 'estados-prenomina':
        registro = await this.prisma.estados_prenomina.findUnique({
          where: { id },
          select: { id: true, nombre: true, descripcion: true },
        });
        break;
      case 'tipos-asesor':
        registro = await this.prisma.tipos_asesor.findUnique({
          where: { id },
          select: { id: true, nombre: true, descripcion: true, activo: true },
        });
        break;
      case 'esquemas-dispersion':
        registro = await this.prisma.esquemas_dispersion.findUnique({
          where: { id },
          select: {
            id: true,
            nombre: true,
            descripcion: true,
            servicio_id: true,
            tipo_asesor_id: true,
            activo: true,
            esquemas_dispersion_detalle: {
              select: {
                id: true,
                concepto_id: true,
                tipo_calculo: true,
                valor: true,
                base_calculo: true,
                orden: true,
                conceptos_dispersion: {
                  select: { id: true, nombre: true, tipo_destino: true },
                },
              },
              orderBy: { orden: 'asc' },
            },
          },
        });
        break;
    }

    if (!registro) throw new NotFoundException('Catálogo no encontrado');
    return registro;
  }

  async create(
    catalogoParam: string,
    dto: CatalogoFinancieroDto,
    usuario: UsuarioAutenticado,
  ) {
    const catalogo = this.getCatalogo(catalogoParam);
    this.ensureCanManage(catalogo, usuario);
    const data = this.validatePayload(catalogo, dto, true);

    try {
      switch (catalogo) {
        case 'servicios':
          return await this.prisma.servicios.create({
            data: data as unknown as Prisma.serviciosCreateInput,
            select: { id: true, nombre: true, descripcion: true, activo: true },
          });
        case 'formas-pago':
          return await this.prisma.formas_pago.create({
            data: data as unknown as Prisma.formas_pagoCreateInput,
            select: { id: true, nombre: true, activo: true },
          });
        case 'tipos-cobro':
          return await this.prisma.tipos_cobro.create({
            data: data as unknown as Prisma.tipos_cobroCreateInput,
            select: { id: true, nombre: true, descripcion: true, activo: true },
          });
        case 'tipos-evidencia-pago':
          return await this.prisma.tipos_evidencia_pago.create({
            data: data as unknown as Prisma.tipos_evidencia_pagoCreateInput,
            select: { id: true, nombre: true, descripcion: true },
          });
        case 'tipos-asesor':
          return await this.prisma.tipos_asesor.create({
            data: data as unknown as Prisma.tipos_asesorCreateInput,
            select: { id: true, nombre: true, descripcion: true, activo: true },
          });
        default:
          throw new BadRequestException(
            'Este catálogo es de solo lectura en la etapa 10.1',
          );
      }
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async update(
    catalogoParam: string,
    idParam: string,
    dto: CatalogoFinancieroDto,
    usuario: UsuarioAutenticado,
  ) {
    const catalogo = this.getCatalogo(catalogoParam);
    this.ensureCanManage(catalogo, usuario);
    const id = this.parseId(idParam);
    const data = this.validatePayload(catalogo, dto, false);

    try {
      switch (catalogo) {
        case 'servicios':
          return await this.prisma.servicios.update({
            where: { id },
            data: data as unknown as Prisma.serviciosUpdateInput,
            select: { id: true, nombre: true, descripcion: true, activo: true },
          });
        case 'formas-pago':
          return await this.prisma.formas_pago.update({
            where: { id },
            data: data as unknown as Prisma.formas_pagoUpdateInput,
            select: { id: true, nombre: true, activo: true },
          });
        case 'tipos-cobro':
          return await this.prisma.tipos_cobro.update({
            where: { id },
            data: data as unknown as Prisma.tipos_cobroUpdateInput,
            select: { id: true, nombre: true, descripcion: true, activo: true },
          });
        case 'tipos-evidencia-pago':
          return await this.prisma.tipos_evidencia_pago.update({
            where: { id },
            data: data as unknown as Prisma.tipos_evidencia_pagoUpdateInput,
            select: { id: true, nombre: true, descripcion: true },
          });
        case 'tipos-asesor':
          return await this.prisma.tipos_asesor.update({
            where: { id },
            data: data as unknown as Prisma.tipos_asesorUpdateInput,
            select: { id: true, nombre: true, descripcion: true, activo: true },
          });
        default:
          throw new BadRequestException(
            'Este catálogo es de solo lectura en la etapa 10.1',
          );
      }
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  private buildActiveFilter(
    catalogo: Catalogo,
    query: QueryCatalogosDto,
    usuario: UsuarioAutenticado,
  ): { activo?: boolean } {
    if (!CATALOGOS_CON_ACTIVO.has(catalogo)) return {};
    if (usuario.roles.nombre === 'asesor') return { activo: true };
    return query.activo === undefined ? {} : { activo: query.activo };
  }

  private validatePayload(
    catalogo: Catalogo,
    dto: CatalogoFinancieroDto,
    creating: boolean,
  ): Record<string, unknown> {
    const fields = MUTABLES[catalogo];
    if (!fields) {
      throw new BadRequestException(
        'Este catálogo es de solo lectura en la etapa 10.1',
      );
    }

    const input = dto as unknown as Record<string, unknown>;
    const supplied = Object.keys(input).filter((key) => input[key] !== undefined);
    const invalid = supplied.filter((key) => !fields.includes(key));
    if (invalid.length > 0) {
      throw new BadRequestException(
        `Campos no permitidos para este catálogo: ${invalid.join(', ')}`,
      );
    }

    if (creating && (typeof input.nombre !== 'string' || !input.nombre.trim())) {
      throw new BadRequestException('El nombre es obligatorio');
    }
    if (supplied.length === 0) {
      throw new BadRequestException('Debe proporcionar al menos un campo');
    }

    const data: Record<string, unknown> = {};
    for (const key of supplied) {
      const value = input[key];
      data[key] = typeof value === 'string' ? value.trim() : value;
    }
    return data;
  }

  private ensureCanRead(catalogo: Catalogo, usuario: UsuarioAutenticado): void {
    this.ensureAuthenticatedRole(usuario);
    if (
      CATALOGOS_SOLO_ADMINISTRATIVOS.includes(catalogo) &&
      !ROLES_ADMINISTRATIVOS.includes(usuario.roles.nombre)
    ) {
      throw new ForbiddenException('No tienes acceso a este catálogo');
    }
  }

  private ensureCanManage(catalogo: Catalogo, usuario: UsuarioAutenticado): void {
    this.ensureAuthenticatedRole(usuario);
    if (!ROLES_ADMINISTRATIVOS.includes(usuario.roles.nombre)) {
      throw new ForbiddenException(
        'Solo administración puede modificar catálogos financieros',
      );
    }
    if (!MUTABLES[catalogo]) {
      throw new BadRequestException(
        'Este catálogo es de solo lectura en la etapa 10.1',
      );
    }
  }

  private ensureAuthenticatedRole(usuario: UsuarioAutenticado): void {
    if (
      !usuario?.roles?.nombre ||
      !['administrador', 'administrador financiero', 'asesor'].includes(
        usuario.roles.nombre,
      )
    ) {
      throw new ForbiddenException('No tienes acceso a Finanzas');
    }
  }

  private getCatalogo(catalogoParam: string): Catalogo {
    if ((CATALOGOS as readonly string[]).includes(catalogoParam)) {
      return catalogoParam as Catalogo;
    }
    throw new NotFoundException('Catálogo financiero no encontrado');
  }

  private parseId(idParam: string): number {
    const id = Number(idParam);
    if (!Number.isSafeInteger(id) || id <= 0 || id > 32767) {
      throw new BadRequestException(
        'El identificador debe ser un entero positivo de hasta 32767',
      );
    }
    return id;
  }

  private handlePrismaError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ConflictException('Ya existe un catálogo con ese nombre');
      }
      if (error.code === 'P2003') {
        throw new BadRequestException('Una referencia proporcionada no existe');
      }
      if (error.code === 'P2025') {
        throw new NotFoundException('Registro de catálogo no encontrado');
      }
      if (error.code === 'P2000') {
        throw new BadRequestException(
          'Uno o más campos exceden la longitud permitida',
        );
      }
    }
    throw error;
  }
}
