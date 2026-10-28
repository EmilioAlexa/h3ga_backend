import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.roles.findMany({
      select: {
        id: true,
        nombre: true,
        descripcion: true,
      },
      orderBy: {
        id: 'asc',
      },
    });
  }
}
