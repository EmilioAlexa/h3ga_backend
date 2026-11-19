import { Module } from '@nestjs/common';
import { DocumentStorageService } from './document-storage.service';
import { GestionDocumentalController } from './gestion-documental.controller';
import { GestionDocumentalService } from './gestion-documental.service';

@Module({ controllers: [GestionDocumentalController], providers: [GestionDocumentalService, DocumentStorageService] })
export class GestionDocumentalModule {}
