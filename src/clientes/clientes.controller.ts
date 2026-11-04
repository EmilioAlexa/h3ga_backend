import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../roles/decorators/roles.decorator';
import { RolesGuard } from '../roles/guards/roles.guard';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { QueryClientesDto } from './dto/query-clientes.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { ClientesService } from './clientes.service';

interface AuthenticatedUser {
  id: string;
  roles: { nombre: string };
}

@Controller('clientes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClientesController {
  constructor(private readonly clientesService: ClientesService) {}

  @Get()
  @Roles('administrador', 'administrador financiero', 'asesor')
  findAll(
    @Query() query: QueryClientesDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.clientesService.findAll(query, currentUser);
  }

  @Get(':id')
  @Roles('administrador', 'administrador financiero', 'asesor')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.clientesService.findOne(id, currentUser);
  }

  @Post()
  @Roles('asesor')
  create(
    @Body() createClienteDto: CreateClienteDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.clientesService.create(createClienteDto, currentUser);
  }

  @Patch(':id')
  @Roles('administrador', 'asesor')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateClienteDto: UpdateClienteDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.clientesService.update(id, updateClienteDto, currentUser);
  }
}
