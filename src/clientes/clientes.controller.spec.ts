import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { PrismaService } from '../database/prisma.service';
import { ClientesController } from './clientes.controller';
import { ClientesService } from './clientes.service';

const jwtSecret = 'clientes-test-secret-with-at-least-32-chars';
const adminId = '7d8eea35-b5e1-4f39-ae42-69a65c4093f1';
const financialAdminId = '80ba120b-c005-41a0-97bd-7724c092e171';
const advisorAId = 'd436c19e-bc35-45e0-bf3e-bf705ff970ab';
const advisorBId = '1da3bb91-d75b-4553-944d-1a26514182b8';
const auxiliaryId = '22b04b13-2a56-4950-b97e-ed784e55ef2a';
const clientAId = '37a2675d-5dda-488f-8195-0fa3e28ce960';
const clientBId = 'c5b107bc-a032-4ea5-8dd7-621b5c24648c';
const clientUnassignedId = '5950a620-0d7f-4312-9b5c-a1fb9228f12b';

type TestUser = {
  id: string;
  activo: boolean;
  roles: { nombre: string };
};

type TestCliente = {
  id: string;
  asesor_id: string | null;
  nombre: string;
  apellido_paterno: string;
  apellido_materno: string | null;
  telefono: string | null;
  correo_electronico: string | null;
  curp: string | null;
  rfc: string | null;
  nss: string | null;
  domicilio: string | null;
  observaciones_generales: string | null;
};

type ClienteWhere = {
  id?: string;
  asesor_id?: string;
  OR?: Array<Record<string, { contains: string; mode: string }>>;
};

const baseClients: TestCliente[] = [
  {
    id: clientAId,
    asesor_id: advisorAId,
    nombre: 'María',
    apellido_paterno: 'López',
    apellido_materno: 'Díaz',
    telefono: '9981234567',
    correo_electronico: 'maria@example.test',
    curp: 'LODM800101MQRPRR09',
    rfc: 'LODM800101AAA',
    nss: '12345678901',
    domicilio: 'Dirección privada',
    observaciones_generales: 'Nota privada',
  },
  {
    id: clientBId,
    asesor_id: advisorBId,
    nombre: 'Carlos',
    apellido_paterno: 'Pérez',
    apellido_materno: null,
    telefono: '9989876543',
    correo_electronico: 'carlos@example.test',
    curp: 'PEGC800101HQRRSR01',
    rfc: 'PEGC800101BBB',
    nss: '98765432109',
    domicilio: 'Otra dirección privada',
    observaciones_generales: null,
  },
  {
    id: clientUnassignedId,
    asesor_id: null,
    nombre: 'Lucía',
    apellido_paterno: 'Gómez',
    apellido_materno: null,
    telefono: null,
    correo_electronico: null,
    curp: null,
    rfc: null,
    nss: null,
    domicilio: null,
    observaciones_generales: null,
  },
];

function matchesWhere(cliente: TestCliente, where?: ClienteWhere): boolean {
  if (where?.id && cliente.id !== where.id) return false;
  if (where?.asesor_id && cliente.asesor_id !== where.asesor_id) return false;
  if (where?.OR?.length) {
    const matchesSearch = where.OR.some((condition) => {
      const [field, filter] = Object.entries(condition)[0];
      const value = cliente[field as keyof TestCliente];
      return (
        typeof value === 'string' &&
        value.toLocaleLowerCase().includes(filter.contains.toLocaleLowerCase())
      );
    });
    if (!matchesSearch) return false;
  }
  return true;
}

function projectCliente(
  cliente: TestCliente,
  select: Record<string, boolean>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(select)
      .filter(([, selected]) => selected)
      .map(([field]) => [field, cliente[field as keyof TestCliente]]),
  );
}

describe('ClientesController (JWT, roles and client scope)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let clients: TestCliente[];
  let users: Map<string, TestUser>;
  let prisma: {
    clientes: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
    usuarios: { findUnique: jest.Mock };
  };

  async function tokenFor(userId: string): Promise<string> {
    return jwt.signAsync({ sub: userId });
  }

  beforeAll(async () => {
    clients = [...baseClients];
    users = new Map<string, TestUser>([
      [adminId, { id: adminId, activo: true, roles: { nombre: 'administrador' } }],
      [
        financialAdminId,
        {
          id: financialAdminId,
          activo: true,
          roles: { nombre: 'administrador financiero' },
        },
      ],
      [advisorAId, { id: advisorAId, activo: true, roles: { nombre: 'asesor' } }],
      [advisorBId, { id: advisorBId, activo: true, roles: { nombre: 'asesor' } }],
      [
        auxiliaryId,
        { id: auxiliaryId, activo: true, roles: { nombre: 'auxiliar administrativo' } },
      ],
    ]);

    prisma = {
      clientes: {
        findMany: jest.fn(async (args) => {
          const matches = clients.filter((client) =>
            matchesWhere(client, args.where as ClienteWhere),
          );
          return matches
            .slice(args.skip, args.skip + args.take)
            .map((client) => projectCliente(client, args.select));
        }),
        findUnique: jest.fn(async (args) => {
          const client = clients.find((candidate) =>
            matchesWhere(candidate, args.where as ClienteWhere),
          );
          return client ? projectCliente(client, args.select) : null;
        }),
        count: jest.fn(async (args) =>
          clients.filter((client) =>
            matchesWhere(client, args.where as ClienteWhere),
          ).length,
        ),
        create: jest.fn(async (args) => {
          const client: TestCliente = {
            id: 'e4ffb39c-5e45-41ae-87f8-668bd2fed535',
            asesor_id: args.data.asesor_id,
            nombre: args.data.nombre,
            apellido_paterno: args.data.apellido_paterno,
            apellido_materno: args.data.apellido_materno ?? null,
            telefono: args.data.telefono ?? null,
            correo_electronico: args.data.correo_electronico ?? null,
            curp: args.data.curp ?? null,
            rfc: args.data.rfc ?? null,
            nss: null,
            domicilio: null,
            observaciones_generales: null,
          };
          clients.push(client);
          return projectCliente(client, args.select);
        }),
        updateMany: jest.fn(async (args) => {
          const client = clients.find((candidate) =>
            matchesWhere(candidate, args.where as ClienteWhere),
          );
          if (!client) return { count: 0 };
          Object.assign(client, args.data);
          return { count: 1 };
        }),
      },
      usuarios: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
          users.get(where.id) ?? null,
        ),
      },
    };

    const moduleRef = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: jwtSecret, signOptions: { expiresIn: '1h' } }),
      ],
      controllers: [ClientesController],
      providers: [
        ClientesService,
        JwtAuthGuard,
        JwtStrategy,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { getOrThrow: () => jwtSecret } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    jwt = app.get(JwtService);
  });

  beforeEach(() => {
    clients = [...baseClients];
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('requires a valid JWT', async () => {
    await request(app.getHttpServer()).get('/api/clientes').expect(401);
  });

  it('lets an administrator list all clients without sensitive fields', async () => {
    const token = await tokenFor(adminId);
    const response = await request(app.getHttpServer())
      .get('/api/clientes')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.data).toHaveLength(3);
    expect(response.body.data[0]).not.toHaveProperty('curp');
    expect(response.body.data[0]).not.toHaveProperty('nss');
    expect(response.body.data[0]).not.toHaveProperty('domicilio');
    expect(prisma.clientes.findMany.mock.calls[0][0].select).not.toHaveProperty(
      'password_hash',
    );
  });

  it('limits an advisor list to clients assigned to the authenticated advisor', async () => {
    const token = await tokenFor(advisorAId);
    const response = await request(app.getHttpServer())
      .get('/api/clientes')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.data.map((client: { id: string }) => client.id)).toEqual([
      clientAId,
    ]);
    expect(prisma.clientes.findMany.mock.calls[0][0].where).toEqual({
      asesor_id: advisorAId,
    });
    expect(response.body.data[0]).not.toHaveProperty('curp');
  });

  it('returns 404 when an advisor requests another advisor client by ID', async () => {
    const token = await tokenFor(advisorAId);

    await request(app.getHttpServer())
      .get(`/api/clientes/${clientBId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    expect(prisma.clientes.findUnique.mock.calls[0][0].where).toEqual({
      id: clientBId,
      asesor_id: advisorAId,
    });
  });

  it('gives the financial administrator only the basic client projection', async () => {
    const token = await tokenFor(financialAdminId);
    const response = await request(app.getHttpServer())
      .get(`/api/clientes/${clientAId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).not.toHaveProperty('curp');
    expect(response.body).not.toHaveProperty('rfc');
    expect(response.body).not.toHaveProperty('asesor_id');
    expect(prisma.clientes.findUnique.mock.calls[0][0].select).toEqual({
      id: true,
      nombre: true,
      apellido_paterno: true,
      apellido_materno: true,
      telefono: true,
      correo_electronico: true,
    });
  });

  it('creates a client only for an active advisor and assigns the JWT user', async () => {
    const token = await tokenFor(advisorAId);
    const response = await request(app.getHttpServer())
      .post('/api/clientes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Elena',
        apellido_paterno: 'Prueba',
        correo_electronico: 'elena@example.test',
        curp: 'LODM800101MQRPRR09',
      })
      .expect(201);

    expect(response.body.asesor_id).toBeUndefined();
    expect(prisma.clientes.create.mock.calls[0][0].data.asesor_id).toBe(
      advisorAId,
    );
    expect(prisma.usuarios.findUnique).toHaveBeenCalledWith({
      where: { id: advisorAId },
      select: { activo: true, roles: { select: { nombre: true } } },
    });
  });

  it('blocks non-advisors from creating clients', async () => {
    const adminToken = await tokenFor(adminId);
    await request(app.getHttpServer())
      .post('/api/clientes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nombre: 'Ana', apellido_paterno: 'Prueba' })
      .expect(403);

    const financeToken = await tokenFor(financialAdminId);
    await request(app.getHttpServer())
      .post('/api/clientes')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ nombre: 'Ana', apellido_paterno: 'Prueba' })
      .expect(403);

    expect(prisma.clientes.create).not.toHaveBeenCalled();
  });

  it('rejects attempts to supply asesor_id and invalid client fields', async () => {
    const token = await tokenFor(advisorAId);

    await request(app.getHttpServer())
      .post('/api/clientes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Ana',
        apellido_paterno: 'Prueba',
        asesor_id: advisorBId,
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/clientes')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Ana',
        apellido_paterno: 'Prueba',
        correo_electronico: 'correo-invalido',
        curp: 'CURP-CORTA',
      })
      .expect(400);

    expect(prisma.clientes.create).not.toHaveBeenCalled();
  });

  it('updates only assigned clients for an advisor and blocks advisor_id changes', async () => {
    const token = await tokenFor(advisorAId);

    await request(app.getHttpServer())
      .patch(`/api/clientes/${clientBId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ telefono: '9990000000' })
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/clientes/${clientAId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ asesor_id: advisorBId })
      .expect(400);

    await request(app.getHttpServer())
      .patch(`/api/clientes/${clientAId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ telefono: '9990000000' })
      .expect(200);

    const updateArgs = prisma.clientes.updateMany.mock.calls[1][0];
    expect(updateArgs.where).toEqual({ id: clientAId, asesor_id: advisorAId });
    expect(updateArgs.data).not.toHaveProperty('asesor_id');
  });

  it('allows an administrator to update another client without changing its advisor', async () => {
    const token = await tokenFor(adminId);

    await request(app.getHttpServer())
      .patch(`/api/clientes/${clientBId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ telefono: '9990000000' })
      .expect(200);

    expect(prisma.clientes.updateMany.mock.calls[0][0].where).toEqual({
      id: clientBId,
    });
    expect(prisma.clientes.updateMany.mock.calls[0][0].data).not.toHaveProperty(
      'asesor_id',
    );
  });

  it('keeps financial administrator access read-only', async () => {
    const token = await tokenFor(financialAdminId);

    await request(app.getHttpServer())
      .patch(`/api/clientes/${clientAId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ telefono: '9990000000' })
      .expect(403);

    expect(prisma.clientes.updateMany).not.toHaveBeenCalled();
  });

  it('applies pagination and search filters', async () => {
    const token = await tokenFor(adminId);
    await request(app.getHttpServer())
      .get('/api/clientes?page=2&limit=1&q=Maria')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const args = prisma.clientes.findMany.mock.calls[0][0];
    expect(args.skip).toBe(1);
    expect(args.take).toBe(1);
    expect(args.where.OR).toHaveLength(4);
  });

  it('rejects unsupported roles and malformed client IDs', async () => {
    const auxiliaryToken = await tokenFor(auxiliaryId);
    await request(app.getHttpServer())
      .get('/api/clientes')
      .set('Authorization', `Bearer ${auxiliaryToken}`)
      .expect(403);

    const adminToken = await tokenFor(adminId);
    await request(app.getHttpServer())
      .get('/api/clientes/not-a-uuid')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });
});
