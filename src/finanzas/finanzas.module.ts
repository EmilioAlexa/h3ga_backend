import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../roles/guards/roles.guard';
import { CatalogosController } from './catalogos/catalogos.controller';
import { CatalogosService } from './catalogos/catalogos.service';
import { ContratosController } from './contratos/contratos.controller';
import { ContratosService } from './contratos/contratos.service';
import { PagosController } from './pagos/pagos.controller';
import { PagosService } from './pagos/pagos.service';
import { PagosProgramadosController } from './pagos-programados/pagos-programados.controller';
import { PagosProgramadosService } from './pagos-programados/pagos-programados.service';
import { EvidenciasController } from './evidencias/evidencias.controller';
import { EvidenciasService } from './evidencias/evidencias.service';
import { StorageModule } from './evidencias/storage/storage.module';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { ComisionesController } from './comisiones/comisiones.controller';
import { ComisionesService } from './comisiones/comisiones.service';
import { CortesFinancierosController } from './cortes-financieros/cortes-financieros.controller';
import { CortesFinancierosService } from './cortes-financieros/cortes-financieros.service';
import { PrenominasController } from './prenomina/prenomina.controller';
import { PrenominasService } from './prenomina/prenomina.service';
import { ReportesFinancierosController } from './reportes/reportes.controller';
import { ReportesFinancierosService } from './reportes/reportes.service';

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
    PrenominasController,
    ReportesFinancierosController,
  ],
  providers: [
    CatalogosService,
    ContratosService,
    PagosService,
    PagosProgramadosService,
    EvidenciasService,
    ComisionesService,
    CortesFinancierosService,
    PrenominasService,
    ReportesFinancierosService,
    RolesGuard,
  ],
})
export class FinanzasModule {}
