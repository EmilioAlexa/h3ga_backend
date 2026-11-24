import { Module } from '@nestjs/common';
import { GestionDocumentalModule } from '../gestion-documental/gestion-documental.module';
import { ModalidadesController } from './modalidades.controller';
import { ModalidadesService } from './modalidades.service';

@Module({ imports: [GestionDocumentalModule], controllers: [ModalidadesController], providers: [ModalidadesService] })
export class ModalidadesModule {}
