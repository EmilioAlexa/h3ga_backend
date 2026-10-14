import { Module } from '@nestjs/common';

import { AuthModule } from './auth/auth.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { RolesModule } from './roles/roles.module';
import { ClientesModule } from './clientes/clientes.module';
import { RutaModule } from './ruta/ruta.module';
import { FinanzasModule } from './finanzas/finanzas.module';
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [AuthModule, UsuariosModule, RolesModule, ClientesModule, RutaModule, FinanzasModule, DatabaseModule],
})
export class AppModule {}
