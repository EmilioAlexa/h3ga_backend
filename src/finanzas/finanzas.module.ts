import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../roles/guards/roles.guard';
import { CatalogosController } from './catalogos.controller';
import { CatalogosService } from './catalogos.service';
import { ContratosController } from './contratos.controller';
import { ContratosService } from './contratos.service';

@Module({
  imports: [AuthModule],
  controllers: [CatalogosController, ContratosController],
  providers: [CatalogosService, ContratosService, RolesGuard],
})
export class FinanzasModule {}
