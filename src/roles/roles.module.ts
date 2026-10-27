import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesController } from './roles.controller';
import { RolesGuard } from './guards/roles.guard';
import { RolesService } from './roles.service';

@Module({
  imports: [AuthModule],
  controllers: [RolesController],
  providers: [RolesService, RolesGuard],
})
export class RolesModule {}
