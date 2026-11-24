/** Verifica el mutex PostgreSQL sin INSERT/UPDATE/DELETE ni migraciones.
 * Opt-in: H3GA_MODALIDADES_LOCK_CHECK=1. Solo la base local de desarrollo aprobada.
 */
import { config } from 'dotenv';
import { PrismaService } from '../../database/prisma.service';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { ModalidadesService } from './modalidades.service';
import type { Prisma } from '../../generated/prisma/client';
import type { UsuarioModalidades } from './modalidades.rules';

const run = process.env.H3GA_MODALIDADES_LOCK_CHECK === '1' ? describe : describe.skip;
run('Bloqueo real por cliente, sin modificar datos', () => {
  let db: PrismaService;
  let pool: Pool;
  beforeAll(async () => {
    config({ quiet: true });
    const url = new URL(process.env.DATABASE_URL!);
    if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname) || url.pathname !== '/h3ga_gestion_pruebas') throw new Error('Destino no autorizado para inspección de locks');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, options: '-c timezone=UTC' });
    db = new PrismaClient({ adapter: new PrismaPg(pool) }) as PrismaService; await db.$connect();
  });
  afterAll(async () => { if (db) await db.$disconnect(); if (pool) await pool.end(); });
  it('una segunda transacción espera a que finalice la primera antes de leer', async () => {
    const cliente = await db.clientes.findFirst({ where: { asesor_id: { not: null }, usuarios: { roles: { nombre: 'asesor' } } }, select: { id: true, asesor_id: true } });
    if (!cliente?.asesor_id) throw new Error('No hay cliente de asesor existente; no se crean fixtures en esta comprobación');
    const user = { id: cliente.asesor_id, roles: { nombre: 'asesor' } };
    const service = new ModalidadesService(db, {} as any) as unknown as { conBloqueo<T>(id: string, u: UsuarioModalidades, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> };
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const ready = new Promise<void>((resolve) => { entered = resolve; });
    let pid = 0, secondEntered = false;
    const first = service.conBloqueo(cliente.id, user, async (tx) => {
      pid = (await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0].pid;
      entered(); await gate; return 'first';
    });
    let second: Promise<string> | undefined;
    try {
      await ready;
      second = service.conBloqueo(cliente.id, user, async (tx) => {
        secondEntered = true;
        await tx.modalidades_aplicacion.count({ where: { cliente_id: cliente.id } });
        return 'second';
      });
      let blocked = false;
      const until = Date.now() + 5000;
      while (!blocked && Date.now() < until) {
        const rows = await db.$queryRaw<{ blocked: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE ${pid}::int = ANY(pg_blocking_pids(pid))) AS blocked`;
        blocked = rows[0].blocked;
        if (!blocked) await new Promise((resolve) => setTimeout(resolve, 30));
      }
      expect(blocked).toBe(true);
      expect(secondEntered).toBe(false);
    } finally {
      release(); await first; if (second) await second;
    }
    expect(secondEntered).toBe(true);
  }, 20000);
});
