import { Module } from '@nestjs/common';
import { FormatosInstitucionalesService } from './formatos-institucionales/formatos-institucionales.service';
import { FormatosInstitucionalesController } from './formatos-institucionales/formatos-institucionales.controller';

@Module({
  providers: [FormatosInstitucionalesService],
  controllers: [FormatosInstitucionalesController]
})
export class GestionModule {}
