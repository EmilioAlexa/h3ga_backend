import 'reflect-metadata';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CatalogosController } from '../finanzas/catalogos/catalogos.controller';
import { ComisionesController } from '../finanzas/comisiones/comisiones.controller';
import { ContratosController } from '../finanzas/contratos/contratos.controller';
import { CortesFinancierosController } from '../finanzas/cortes-financieros/cortes-financieros.controller';
import { EvidenciasController } from '../finanzas/evidencias/evidencias.controller';
import { PagosProgramadosController } from '../finanzas/pagos-programados/pagos-programados.controller';
import { PagosController } from '../finanzas/pagos/pagos.controller';
import { PrenominasController } from '../finanzas/prenomina/prenomina.controller';
import { ReportesFinancierosController } from '../finanzas/reportes/reportes.controller';
import { ROLES_KEY } from '../roles/decorators/roles.decorator';
import { RolesGuard } from '../roles/guards/roles.guard';

const financeControllers = [
  CatalogosController,
  ComisionesController,
  ContratosController,
  CortesFinancierosController,
  EvidenciasController,
  PagosProgramadosController,
  PagosController,
  PrenominasController,
  ReportesFinancierosController,
];

describe('I1: frontera del rol auxiliar administrativo en Finanzas', () => {
  it.each(financeControllers)('%s exige JWT y RolesGuard y excluye auxiliar', (controller) => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, controller) as unknown[];
    expect(guards).toContain(JwtAuthGuard);
    expect(guards).toContain(RolesGuard);

    const classRoles = Reflect.getMetadata(ROLES_KEY, controller) as string[];
    expect(classRoles).toBeDefined();
    expect(classRoles).not.toContain('auxiliar administrativo');
    expect(classRoles).not.toContain('auxiliar');

    for (const methodName of Object.getOwnPropertyNames(controller.prototype)) {
      if (methodName === 'constructor') continue;
      const handler = Object.getOwnPropertyDescriptor(controller.prototype, methodName)?.value;
      if (typeof handler !== 'function') continue;
      const methodRoles = Reflect.getMetadata(ROLES_KEY, handler) as string[] | undefined;
      expect(methodRoles ?? classRoles).not.toContain('auxiliar administrativo');
      expect(methodRoles ?? classRoles).not.toContain('auxiliar');
    }
  });

  it('RolesGuard rechaza en ejecución una consulta de pagos del auxiliar', () => {
    const context = {
      getHandler: () => PagosController.prototype.findAll,
      getClass: () => PagosController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { roles: { nombre: 'auxiliar administrativo' } } }),
      }),
    } as unknown as ExecutionContext;
    const guard = new RolesGuard(new Reflector());
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
