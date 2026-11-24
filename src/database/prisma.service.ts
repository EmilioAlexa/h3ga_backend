import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
  const remoteProduction = process.env.NODE_ENV === 'production';
  const connectionString = process.env.DATABASE_URL!;
  const pool = new Pool({
    connectionString: remoteProduction
      ? (() => {
          const url = new URL(connectionString);
          for (const key of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey']) {
            url.searchParams.delete(key);
          }
          return url.toString();
        })()
      : connectionString,
    ...(remoteProduction
      ? {
          ssl: {
            ca: readFileSync(process.env.DATABASE_SSL_CA_FILE!, 'utf8'),
            rejectUnauthorized: true,
          },
        }
      : {}),
    options: '-c timezone=UTC',
  });

  const adapter = new PrismaPg(pool, { disposeExternalPool: true });

  super({
    adapter,
  });
}

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
