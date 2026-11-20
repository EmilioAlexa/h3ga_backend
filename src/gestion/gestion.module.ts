
import { Module } from '@nestjs/common';

import { FormatosInstitucionalesService } from './formatos-institucionales/formatos-institucionales.service';
import { FormatosInstitucionalesController } from './formatos-institucionales/formatos-institucionales.controller';

import { GestionAuxiliaresModule } from './gestion-auxiliares/gestion-auxiliares.module';
import { GestionDocumentalModule } from './gestion-documental/gestion-documental.module';
import { ProcesoFinalModule } from './proceso-final/proceso-final.module';

@Module({
  imports: [
    GestionAuxiliaresModule,
    GestionDocumentalModule,
    ProcesoFinalModule,
  ],
  providers: [
    FormatosInstitucionalesService,
  ],
  controllers: [
    FormatosInstitucionalesController,
  ],
})
export class GestionModule {}
