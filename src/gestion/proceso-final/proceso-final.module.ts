import { Module } from '@nestjs/common';
import { ProcesoFinalController } from './proceso-final.controller';
import { ProcesoFinalService } from './proceso-final.service';

@Module({
  controllers: [ProcesoFinalController],
  providers: [ProcesoFinalService],
})
export class ProcesoFinalModule {}
