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
@Roles('administrador')
export class FormatosInstitucionalesController {
  constructor(
    private readonly formatosService: FormatosInstitucionalesService,
  ) {}

  // List formats with filters
  @Get()
  findAll(@Query() query: QueryFormatosDto) {
    return this.formatosService.findAll(query);
  }

  // Get a format by ID
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.formatosService.findOne(id);
  }

  // Create a format
  @Post()
  create(
    @Body() dto: CreateFormatoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.formatosService.create(dto, user.id);
  }

  // Update a format
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFormatoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.formatosService.update(id, dto, user.id);
  }

  // Delete a format (soft delete)
  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.formatosService.remove(id, user.id);
  }
}
