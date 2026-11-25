import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../../roles/guards/roles.guard';
import { ROLES_KEY } from '../../roles/decorators/roles.decorator';
import { ServiciosComplementariosController } from './servicios-complementarios.controller';

describe('Autorización de Servicios Complementarios', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);
  const context = (user?: object) => ({
    getHandler: () => ServiciosComplementariosController.prototype.detalle,
    getClass: () => ServiciosComplementariosController,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as any;

  it('declara exclusivamente el rol asesor', () => {
    expect(reflector.get(ROLES_KEY, ServiciosComplementariosController)).toEqual(['asesor']);
  });
  it('rechaza ausencia de usuario y roles no autorizados', () => {
    expect(() => guard.canActivate(context())).toThrow(UnauthorizedException);
    for (const nombre of ['administrador', 'auxiliar administrativo', 'administrador financiero']) {
      expect(() => guard.canActivate(context({ roles: { nombre } }))).toThrow(ForbiddenException);
    }
  });
  it('admite el rol asesor en el guard de roles', () => {
    expect(guard.canActivate(context({ roles: { nombre: 'asesor' } }))).toBe(true);
  });
});
