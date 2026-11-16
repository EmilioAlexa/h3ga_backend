import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../roles/guards/roles.guard';
import { Roles } from '../../roles/decorators/roles.decorator';

import { FormatosInstitucionalesService } from './formatos-institucionales.service';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { CreateFormatoDto } from './dto/create-formato.dto';
import { UpdateFormatoDto } from './dto/update-formato.dto';
import { QueryFormatosDto } from './dto/query-formatos.dto';
import { 
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards, 
} from '@nestjs/common';

interface AuthenticatedUser {
  id: string;
}

@Controller('gestion/formatos')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FormatosInstitucionalesController {
  constructor(
    private readonly formatosService: FormatosInstitucionalesService,
  ) {}

  // List formats with filters
  @Get()
  @Roles('administrador', 'asesor', 'auxiliar_administrativo')
  findAll(@Query() query: QueryFormatosDto) {
    return this.formatosService.findAll(query);
  }
// Consultar formatos y filtros para la biblioteca

   @Get('biblioteca')
@Roles('administrador', 'asesor', 'auxiliar_administrativo')
findBiblioteca(@Query() query: QueryFormatosDto) {
  return this.formatosService.findBiblioteca(query);
}

// descargar un formato por ID
@Get(':id/descargar')
@Roles('administrador', 'asesor', 'auxiliar_administrativo')
descargar(
  @Param('id', ParseIntPipe) id: number,
) {
  return this.formatosService.descargar(id);
}
  

  // Get a format by ID
  @Get(':id')
  @Roles('administrador', 'asesor', 'auxiliar_administrativo')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.formatosService.findOne(id);
  }

  // Create a format
  @Post()
  @Roles('administrador')
  create(
    @Body() dto: CreateFormatoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.formatosService.create(dto, user.id);
  }

  // Update a format
  @Patch(':id')
  @Roles('administrador')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFormatoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.formatosService.update(id, dto, user.id);
  }

  // Delete a format (soft delete)
  @Delete(':id')
  @Roles('administrador')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.formatosService.remove(id, user.id);
  }
 
}
