import { Module } from '@nestjs/common';
import { FormatosInstitucionalesService } from './formatos-institucionales/formatos-institucionales.service';

@Module({
  providers: [FormatosInstitucionalesService]
})
export class GestionModule {}
