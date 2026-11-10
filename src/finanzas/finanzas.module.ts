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
import { EvidenciasController } from './evidencias/evidencias.controller';
import { EvidenciasService } from './evidencias/evidencias.service';
import { StorageModule } from './storage/storage.module';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { ComisionesController } from './comisiones.controller';
import { ComisionesService } from './comisiones.service';
import { CortesFinancierosController } from './cortes-financieros.controller';
import { CortesFinancierosService } from './cortes-financieros.service';

@Module({
  imports: [
    AuthModule,
    StorageModule,
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        limits: {
          fileSize: config.getOrThrow<number>('storage.maxFileSizeMb') * 1024 * 1024,
          files: 1,
          fields: 0,
          parts: 1,
        },
      }),
    }),
  ],
  controllers: [
    CatalogosController,
    ContratosController,
    PagosController,
    PagosProgramadosController,
    EvidenciasController,
    ComisionesController,
    CortesFinancierosController,
  ],
  providers: [
    CatalogosService,
    ContratosService,
    PagosService,
    PagosProgramadosService,
    EvidenciasService,
    ComisionesService,
    CortesFinancierosService,
    RolesGuard,
  ],
})
export class FinanzasModule {}
