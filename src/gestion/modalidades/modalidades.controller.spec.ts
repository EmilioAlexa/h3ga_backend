import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import request from 'supertest';
import { Readable } from 'node:stream';
import { JwtStrategy } from '../../auth/strategies/jwt.strategy';
import { PrismaService } from '../../database/prisma.service';
import { RolesGuard } from '../../roles/guards/roles.guard';
import { ModalidadesController } from './modalidades.controller';
import { ModalidadesService } from './modalidades.service';
import { GestionDocumentalController } from '../gestion-documental/gestion-documental.controller';
import { GestionDocumentalService } from '../gestion-documental/gestion-documental.service';

const id = '11111111-1111-4111-8111-111111111111';
const base = `/api/gestion/modalidades/clientes/${id}/modalidades`;
const secret = 'modalidades-http-test-secret-not-for-production';
describe('Contratos HTTP de Modalidades y expediente', () => {
  let app: INestApplication, jwt: JwtService;
  const service = { guardar: jest.fn().mockResolvedValue({ modalidades: [] }), actualizar: jest.fn().mockResolvedValue({ modalidad: 'modalidad_10' }), catalogos: jest.fn().mockResolvedValue({ fases: [], estatus: [] }), findClientes: jest.fn().mockResolvedValue({ data: [], pagination: {} }) };
  const documental = { cargarDocumento: jest.fn().mockResolvedValue({ id }), obtenerDocumento: jest.fn(), actualizarMetadatos: jest.fn().mockResolvedValue({ id }), findDocumentos: jest.fn().mockResolvedValue([]), eliminarDocumento: jest.fn().mockResolvedValue(undefined) };
  const token = (rol = 'asesor') => jwt.sign({ sub: rol });
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PassportModule, JwtModule.register({ secret })],
      controllers: [ModalidadesController, GestionDocumentalController],
      providers: [JwtStrategy, RolesGuard,
        { provide: ConfigService, useValue: { getOrThrow: () => secret } },
        { provide: PrismaService, useValue: { usuarios: { findUnique: jest.fn(async ({ where }) => where.id === 'inactivo' ? { id, activo: false, roles: { nombre: 'asesor' } } : { id, activo: true, roles: { nombre: where.id } }) } } },
        { provide: ModalidadesService, useValue: service }, { provide: GestionDocumentalService, useValue: documental },
      ],
    }).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    jwt = module.get(JwtService); await app.init();
  });
  beforeEach(() => jest.clearAllMocks());
  afterAll(async () => app.close());

  it('sin JWT devuelve 401', async () => { await request(app.getHttpServer()).get('/api/gestion/modalidades/catalogos').expect(401); });
  it('JWT inválido devuelve 401', async () => { await request(app.getHttpServer()).get('/api/gestion/modalidades/catalogos').auth('invalido', { type: 'bearer' }).expect(401); });
  it('JWT expirado devuelve 401', async () => { await request(app.getHttpServer()).get('/api/gestion/modalidades/catalogos').auth(jwt.sign({ sub: 'asesor' }, { expiresIn: -1 }), { type: 'bearer' }).expect(401); });
  it('usuario inactivo devuelve 401', async () => { await request(app.getHttpServer()).get('/api/gestion/modalidades/catalogos').auth(token('inactivo'), { type: 'bearer' }).expect(401); });
  it.each(['administrador', 'auxiliar administrativo', 'administrador financiero'])('rol %s devuelve 403 en seguimiento', async (role) => {
    await request(app.getHttpServer()).put(base).auth(token(role), { type: 'bearer' }).send({ modalidades: ['modalidad_10'] }).expect(403);
    expect(service.guardar).not.toHaveBeenCalled();
  });
  it('asesor válido usa la identidad resuelta por JWT', async () => {
    await request(app.getHttpServer()).put(base).auth(token(), { type: 'bearer' }).send({ modalidades: ['modalidad_10'] }).expect(200);
    expect(service.guardar.mock.calls[0][2]).toMatchObject({ id, roles: { nombre: 'asesor' } });
  });
  it.each([
    { modalidades: ['modalidad_10'], asesor_id: id }, { modalidades: ['modalidad_10'], diagnostico_id: id },
    { modalidades: ['modalidad_10', 'modalidad_10'] }, { modalidades: ['mixto'] }, { modalidades: [] }, { modalidades: ['modalidad_10', 'modalidad_40', 'modalidad_40_retroactiva'] },
  ])('rechaza selección DTO inválida %j', async (body) => {
    await request(app.getHttpServer()).put(base).auth(token(), { type: 'bearer' }).send(body).expect(400);
    expect(service.guardar).not.toHaveBeenCalled();
  });
  it.each([
    { fase_id: null }, { estatus_id: null }, { fecha_cita_imss: '2026-02-30' }, { fecha_cita_imss: '2026-01-01T12:00:00Z' },
    { ultimo_salario_diario_registrado: '100000000.00' }, { ultimo_salario_diario_registrado: '1.234' }, { motivo_cierre: 'No interesado' },
    { aplica_m40: true }, { tipo_modalidad: 'mixto' }, { actualizado_por: id },
  ])('rechaza seguimiento DTO inválido %j', async (body) => {
    await request(app.getHttpServer()).patch(`${base}/modalidad_10`).auth(token(), { type: 'bearer' }).send(body).expect(400);
    expect(service.actualizar).not.toHaveBeenCalled();
  });
  it('acepta vaciar datos individuales nullable explícitamente', async () => {
    await request(app.getHttpServer()).patch(`${base}/modalidad_10`).auth(token(), { type: 'bearer' }).send({ fecha_cita_imss: null, ultimo_salario_diario_registrado: null }).expect(200);
  });
  it('rechaza identificador inválido', async () => {
    await request(app.getHttpServer()).put('/api/gestion/modalidades/clientes/incorrecto/modalidades').auth(token(), { type: 'bearer' }).send({ modalidades: ['modalidad_10'] }).expect(400);
  });
  it('rechaza tamaño por interceptor antes de ejecutar el servicio', async () => {
    await request(app.getHttpServer()).post(`/api/gestion/documental/clientes/${id}/documentos`).auth(token(), { type: 'bearer' })
      .field('tipo_documento_id', '1').attach('archivo', Buffer.alloc(10 * 1024 * 1024 + 1), 'exceso.pdf').expect(413);
    expect(documental.cargarDocumento).not.toHaveBeenCalled();
  });
  it('no concede carga del asesor al auxiliar', async () => {
    await request(app.getHttpServer()).post(`/api/gestion/documental/clientes/${id}/documentos`).auth(token('auxiliar administrativo'), { type: 'bearer' }).field('tipo_documento_id', '1').attach('archivo', Buffer.from('pdf'), 'a.pdf').expect(403);
  });
  it.each([
    ['visualizar', 'application/pdf', 'inline'], ['visualizar', 'application/msword', 'attachment'], ['descargar', 'image/png', 'attachment'],
  ])('%s devuelve %s como %s', async (action, mime, disposition) => {
    documental.obtenerDocumento.mockResolvedValue({ file: { stream: Readable.from(Buffer.from('contenido')) }, filename: 'documento original', contentType: mime });
    const res = await request(app.getHttpServer()).get(`/api/gestion/documental/documentos/${id}/${action}`).auth(token(), { type: 'bearer' }).expect(200);
    expect(res.headers['content-disposition']).toContain(disposition);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.headers['content-type']).toContain(mime);
  });
  it('publica eliminación documental y no publica reemplazo', async () => {
    await request(app.getHttpServer()).delete(`/api/gestion/documental/documentos/${id}`).auth(token(), { type: 'bearer' }).expect(204);
    expect(documental.eliminarDocumento).toHaveBeenCalledWith(id, expect.objectContaining({ id }));
    await request(app.getHttpServer()).put(`/api/gestion/documental/documentos/${id}/archivo`).auth(token(), { type: 'bearer' }).expect(404);
  });
  it('protege la eliminación con JWT, rol e identificador válido', async () => {
    await request(app.getHttpServer()).delete(`/api/gestion/documental/documentos/${id}`).expect(401);
    for (const role of ['auxiliar administrativo', 'administrador', 'administrador financiero']) await request(app.getHttpServer()).delete(`/api/gestion/documental/documentos/${id}`).auth(token(role), { type: 'bearer' }).expect(403);
    await request(app.getHttpServer()).delete('/api/gestion/documental/documentos/invalido').auth(token(), { type: 'bearer' }).expect(400);
    expect(documental.eliminarDocumento).not.toHaveBeenCalled();
  });
  it('Swagger registra rutas, seguridad, DTO y formatos de carga', () => {
    const doc = SwaggerModule.createDocument(app, new DocumentBuilder().addBearerAuth(undefined, 'jwt').build());
    expect(doc.paths['/api/gestion/modalidades/clientes/{clienteId}/modalidades'].put?.security).toEqual([{ jwt: [] }]);
    expect(doc.paths['/api/gestion/modalidades/clientes/{clienteId}/modalidades/{modalidad}'].patch?.requestBody).toBeDefined();
    expect(doc.paths['/api/gestion/documental/clientes/{clienteId}/documentos'].post?.requestBody).toHaveProperty('content.multipart/form-data');
    expect(doc.paths['/api/gestion/documental/documentos/{documentoId}'].delete?.responses).toHaveProperty('204');
  });
});
