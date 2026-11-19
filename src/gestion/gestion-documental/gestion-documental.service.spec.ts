import { ForbiddenException } from '@nestjs/common';
import { GestionDocumentalService } from './gestion-documental.service';

describe('GestionDocumentalService', () => {
  it('impide a un asesor consultar la bandeja privada del auxiliar', async () => {
    const service = new GestionDocumentalService({} as any, {} as any);
    await expect(service.findTareas({ id: '11111111-1111-4111-8111-111111111111', roles: { nombre: 'asesor' } })).rejects.toBeInstanceOf(ForbiddenException);
  });
});
