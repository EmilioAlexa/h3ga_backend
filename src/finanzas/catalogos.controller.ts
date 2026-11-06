import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../roles/decorators/roles.decorator';
import { RolesGuard } from '../roles/guards/roles.guard';
import { CatalogoFinancieroDto } from './dto/catalogo-financiero.dto';
import { QueryCatalogosDto } from './dto/query-catalogos.dto';
import { CatalogosService } from './catalogos.service';

interface UsuarioAutenticado {
  id: string;
  roles: { nombre: string };
}

@Controller('finanzas/catalogos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrador', 'administrador financiero', 'asesor')
export class CatalogosController {
  constructor(private readonly catalogosService: CatalogosService) {}

  @Get()
  getCatalogos(@CurrentUser() usuario: UsuarioAutenticado) {
    return this.catalogosService.getCatalogos(usuario);
  }

  @Get(':catalogo')
  findAll(
    @Param('catalogo') catalogo: string,
    @Query() query: QueryCatalogosDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.catalogosService.findAll(catalogo, query, usuario);
  }

  @Get(':catalogo/:id')
  findOne(
    @Param('catalogo') catalogo: string,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.catalogosService.findOne(catalogo, String(id), usuario);
  }

  @Post(':catalogo')
  @Roles('administrador', 'administrador financiero')
  create(
    @Param('catalogo') catalogo: string,
    @Body() dto: CatalogoFinancieroDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.catalogosService.create(catalogo, dto, usuario);
  }

  @Patch(':catalogo/:id')
  @Roles('administrador', 'administrador financiero')
  update(
    @Param('catalogo') catalogo: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CatalogoFinancieroDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.catalogosService.update(catalogo, String(id), dto, usuario);
  }
}
