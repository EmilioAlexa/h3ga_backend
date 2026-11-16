import {Injectable, BadRequestException, NotFoundException, NotImplementedException} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { QueryFormatosDto } from './dto/query-formatos.dto';
import { UpdateFormatoDto } from './dto/update-formato.dto';
import { CreateFormatoDto } from './dto/create-formato.dto';

@Injectable()
export class FormatosInstitucionalesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryFormatosDto, esBiblioteca: boolean = false) {
  const {
    nuevos,
    buscar,
    tipo,
    dependencia_id,
    desde,
    hasta,
    orden = 'recientes',
    pagina = 1,
    limite = 10,
  } = query;

  const inicio = desde
    ? new Date(`${desde}T00:00:00.000Z`)
    : undefined;

  const fin = hasta
    ? new Date(`${hasta}T23:59:59.999Z`)
    : undefined;

  if (
    (inicio && Number.isNaN(inicio.getTime())) ||
    (fin && Number.isNaN(fin.getTime()))
  ) {
    throw new BadRequestException('Fecha inválida');
  }

  if (inicio && fin && inicio > fin) {
    throw new BadRequestException(
      'La fecha inicial no puede ser posterior a la final',
    );
  }

  const where: Prisma.formatos_institucionalesWhereInput = {
  activo: true,

  ...(dependencia_id && {
    dependencia_id,
  }),
  ...(esBiblioteca && nuevos && {
  creado_en: {
    gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  },
}),

  ...(buscar && {
    nombre: {
      contains: buscar,
      mode: 'insensitive',
    },
  }),

    ...(tipo && {
      tipo_formato: tipo,
    }),

    ...((inicio || fin || (esBiblioteca && nuevos)) && {
  creado_en: {
    ...(inicio && { gte: inicio }),
    ...(fin && { lte: fin }),
    ...(esBiblioteca && nuevos && {
      gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    }),
  },
}),
  };

  const [total, formatos] = await this.prisma.$transaction([
    this.prisma.formatos_institucionales.count({
      where,
    }),

    this.prisma.formatos_institucionales.findMany({
      where,

      select: {
        id: true,
        nombre: true,
        descripcion: true,
        tipo_formato: true,
        enlace_url: true,
        archivo_path: true,
        creado_en: true,
        dependencias_formato: {
          select: {
            id: true,
            nombre: true,
          },
        },
      },

      orderBy: [
        {
          creado_en:
            orden === 'antiguos' ? 'asc' : 'desc',
        },
        { id: 'asc' },
      ],

      skip: (pagina - 1) * limite,
      take: limite,
    }),
  ]);

  return {
    datos: formatos,
    paginacion: {
      total,
      pagina,
      limite,
      totalPaginas: Math.ceil(total / limite),
    },
  };
}
// Consultar formatos disponibles en la biblioteca
async findBiblioteca(query: QueryFormatosDto) {
  const resultado = await this.findAll(query, true);

  const ahora = Date.now();
  const sieteDias = 7 * 24 * 60 * 60 * 1000;

  const datos = resultado.datos.map((formato) => ({
    ...formato,
    es_nuevo:
      ahora - new Date(formato.creado_en).getTime() <= sieteDias,
  }));

  return {
    ...resultado,
    datos,
  };
}

// Descargar formato institucional
async descargar(id: number) {
  const formato = await this.findOne(id);

  if (!formato.archivo_path) {
    throw new BadRequestException(
      'El formato no tiene un archivo asociado para descargar.',
    );
  }

  throw new NotImplementedException(
    'La descarga estará disponible cuando se configure el almacenamiento de archivos.',
  );
}

async findOne(id: number) {
  const formato = await this.prisma.formatos_institucionales.findFirst({
    where: {
      id,
      activo: true,
    },
    select: {
      id: true,
      nombre: true,
      descripcion: true,
      tipo_formato: true,
      enlace_url: true,
      archivo_path: true,
      creado_en: true,
      dependencias_formato: {
        select: {
          id: true,
          nombre: true,
        },
      },
    },
  });

  if (!formato) {
    throw new NotFoundException(
      'El formato solicitado no existe o está inactivo.',
    );
  }

  return formato;
}

async create(dto: CreateFormatoDto, userId: string) {
  // Verificar que la dependencia exista y esté activa
  const dependencia = await this.prisma.dependencias_formato.findFirst({
    where: {
      id: dto.dependencia_id,
      activo: true,
    },
  });

  if (!dependencia) {
    throw new BadRequestException(
      'La dependencia seleccionada no existe o está inactiva.',
    );
  }

  // Verificar que el nombre no esté registrado
  const formatoExistente =
    await this.prisma.formatos_institucionales.findUnique({
      where: {
        nombre: dto.nombre,
      },
    });

  if (formatoExistente) {
    throw new BadRequestException(
      'Ya existe un formato con ese nombre.',
    );
  }

  // Validar que la extensión coincida con el tipo de formato
if (dto.archivo_path) {
  const extension = dto.archivo_path.toLowerCase();

  if (dto.tipo_formato === 'pdf' && !extension.endsWith('.pdf')) {
    throw new BadRequestException(
      'El archivo debe tener extensión .pdf.',
    );
  }

  if (
    dto.tipo_formato === 'word' &&
    !extension.endsWith('.doc') &&
    !extension.endsWith('.docx')
  ) {
    throw new BadRequestException(
      'El archivo debe tener extensión .doc o .docx.',
    );
  }
}
  return this.prisma.formatos_institucionales.create({
    data: {
      nombre: dto.nombre,
      descripcion: dto.descripcion,
      dependencia_id: dto.dependencia_id,
      tipo_formato: dto.tipo_formato,
      enlace_url: dto.enlace_url,
      archivo_path: dto.archivo_path,
      creado_por: userId,
    },
    select: {
      id: true,
      nombre: true,
      descripcion: true,
      tipo_formato: true,
      enlace_url: true,
      archivo_path: true,
      creado_en: true,
      dependencias_formato: {
        select: {
          id: true,
          nombre: true,
        },
      },
    },
  });
}

async update(
    id: number,
    dto: UpdateFormatoDto,
    userId: string,
  ) {
  // Verificar que el formato exista y esté activo
const formatoActual = await this.findOne(id);

// Obtener el tipo y la ruta definitivos después de actualizar
const tipoFinal = dto.tipo_formato ?? formatoActual.tipo_formato;
const archivoFinal = dto.archivo_path ?? formatoActual.archivo_path;

// Validar que la extensión coincida con el tipo de formato
if (archivoFinal) {
  const extension = archivoFinal.toLowerCase();

  if (tipoFinal === 'pdf' && !extension.endsWith('.pdf')) {
    throw new BadRequestException(
      'El archivo debe tener extensión .pdf porque el tipo seleccionado es PDF.',
    );
  }

  if (
    tipoFinal === 'word' &&
    !extension.endsWith('.doc') &&
    !extension.endsWith('.docx')
  ) {
    throw new BadRequestException(
      'El archivo debe tener extensión .doc o .docx porque el tipo seleccionado es Word.',
    );
  }

  if (tipoFinal === 'enlace') {
    throw new BadRequestException(
      'Los formatos de tipo enlace no deben tener un archivo asociado.',
    );
  }
}

  // Si se cambia la dependencia, comprobar que exista
  if (dto.dependencia_id !== undefined) {
    const dependencia = await this.prisma.dependencias_formato.findFirst({
      where: {
        id: dto.dependencia_id,
        activo: true,
      },
    });

    if (!dependencia) {
      throw new BadRequestException(
        'La dependencia seleccionada no existe o está inactiva.',
      );
    }
  }
    // Si se cambia el nombre, comprobar que no esté ocupado
  if (dto.nombre !== undefined) {
    const formatoExistente =
      await this.prisma.formatos_institucionales.findUnique({
        where: {
          nombre: dto.nombre,
        },
      });

    if (formatoExistente && formatoExistente.id !== id) {
      throw new BadRequestException(
        'Ya existe otro formato con ese nombre.',
      );
    }
  }

  // Actualizar y devolver el formato
  return this.prisma.formatos_institucionales.update({
    where: { id },
    data: {
      ...dto,
      actualizado_por: userId,
      actualizado_en: new Date(),
    },
    select: {
      id: true,
      nombre: true,
      descripcion: true,
      tipo_formato: true,
      enlace_url: true,
      archivo_path: true,
      actualizado_en: true,
      dependencias_formato: {
        select: {
          id: true,
          nombre: true,
        },
      },
    },
  });
}


async remove(id: number, userId: string) {
  // Verificar que el formato exista y esté activo
  await this.findOne(id);

  // Desactivar el formato
  await this.prisma.formatos_institucionales.update({
    where: { id },
    data: {
      activo: false,
      actualizado_por: userId,
      actualizado_en: new Date(),
    },
  });

  return {
    mensaje: 'El formato se ha eliminado correctamente.',
  };
}

}