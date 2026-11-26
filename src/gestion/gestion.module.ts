
import { Module } from '@nestjs/common';

import { FormatosInstitucionalesService } from './formatos-institucionales/formatos-institucionales.service';
import { FormatosInstitucionalesController } from './formatos-institucionales/formatos-institucionales.controller';

import { GestionAuxiliaresModule } from './gestion-auxiliares/gestion-auxiliares.module';
import { GestionDocumentalModule } from './gestion-documental/gestion-documental.module';
import { ProcesoFinalModule } from './proceso-final/proceso-final.module';
import { ModalidadesModule } from './modalidades/modalidades.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ServiciosComplementariosModule } from './servicios-complementarios/servicios-complementarios.module';

@Module({
  imports: [
    GestionAuxiliaresModule,
    GestionDocumentalModule,
    DashboardModule,
    ProcesoFinalModule,
    ModalidadesModule,
    ServiciosComplementariosModule,
  ],
  providers: [
    FormatosInstitucionalesService,
  ],
  controllers: [
    FormatosInstitucionalesController,
  ],
})
export class GestionModule {}
