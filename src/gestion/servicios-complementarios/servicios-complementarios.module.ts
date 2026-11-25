import { Module } from '@nestjs/common';
import { GestionDocumentalModule } from '../gestion-documental/gestion-documental.module';
import { ServiciosComplementariosController } from './servicios-complementarios.controller';
import { ServiciosComplementariosService } from './servicios-complementarios.service';

@Module({ imports: [GestionDocumentalModule], controllers: [ServiciosComplementariosController], providers: [ServiciosComplementariosService] })
export class ServiciosComplementariosModule {}
