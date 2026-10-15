import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import configuration from './config/configuration';
import {envValidationSchema} from './config/env.validation';
import { AuthModule } from './auth/auth.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { RolesModule } from './roles/roles.module';
import { ClientesModule } from './clientes/clientes.module';
import { RutaModule } from './ruta/ruta.module';
import { FinanzasModule } from './finanzas/finanzas.module';
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
    }),
    AuthModule,
    UsuariosModule,
    RolesModule,  
    ClientesModule,
    RutaModule,
    FinanzasModule,
    DatabaseModule,
  ],
})
export class AppModule {}
