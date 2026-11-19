import { Module } from '@nestjs/common';
import { GestionAuxiliaresController } from './gestion-auxiliares.controller';
import { GestionAuxiliaresService } from './gestion-auxiliares.service';

@Module({ controllers: [GestionAuxiliaresController], providers: [GestionAuxiliaresService], exports: [GestionAuxiliaresService] })
export class GestionAuxiliaresModule {}
