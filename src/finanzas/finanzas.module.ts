import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../roles/guards/roles.guard';
import { CatalogosController } from './catalogos.controller';
import { CatalogosService } from './catalogos.service';
import { ContratosController } from './contratos.controller';
import { ContratosService } from './contratos.service';
import { PagosController } from './pagos.controller';
import { PagosService } from './pagos.service';

@Module({
  imports: [AuthModule],
  controllers: [CatalogosController, ContratosController, PagosController],
  providers: [CatalogosService, ContratosService, PagosService, RolesGuard],
})
export class FinanzasModule {}
