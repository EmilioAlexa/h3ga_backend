import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../roles/guards/roles.guard';
import { CatalogosController } from './catalogos.controller';
import { CatalogosService } from './catalogos.service';
import { ContratosController } from './contratos.controller';
import { ContratosService } from './contratos.service';
import { PagosController } from './pagos.controller';
import { PagosService } from './pagos.service';
import { PagosProgramadosController } from './pagos-programados.controller';
import { PagosProgramadosService } from './pagos-programados.service';

@Module({
  imports: [AuthModule],
  controllers: [
    CatalogosController,
    ContratosController,
    PagosController,
    PagosProgramadosController,
  ],
  providers: [
    CatalogosService,
    ContratosService,
    PagosService,
    PagosProgramadosService,
    RolesGuard,
  ],
})
export class FinanzasModule {}
