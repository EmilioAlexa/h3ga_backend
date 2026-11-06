import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../roles/guards/roles.guard';
import { CatalogosController } from './catalogos.controller';
import { CatalogosService } from './catalogos.service';

@Module({
  imports: [AuthModule],
  controllers: [CatalogosController],
  providers: [CatalogosService, RolesGuard],
})
export class FinanzasModule {}
