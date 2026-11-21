import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class ContractSchemaService {
  constructor(private readonly prisma: PrismaService) {}
  async capabilities() {
    const rows = await this.prisma.$queryRaw<
      Array<{ documentos: boolean }>
    >`
      WITH installation AS (SELECT EXISTS (SELECT 1 FROM public."_prisma_migrations" WHERE migration_name='20261121130000_documentos_contractuales' AND finished_at IS NOT NULL AND rolled_back_at IS NULL) AS ready)
      SELECT
      (installation.ready AND to_regclass('public.documentos_contrato') IS NOT NULL
       AND (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='documentos_contrato' AND column_name IN ('id','contrato_id','subido_por','solicitud_id','nombre_original','mime_type','tamano_bytes','clave_privada','sha256','creado_en'))=10
       AND EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='documentos_contrato' AND indexname='uq_documentos_contrato_solicitud')
       AND (SELECT count(*) FROM pg_constraint WHERE conrelid=to_regclass('public.documentos_contrato') AND contype='f')=2) AS documentos FROM installation`;
    return rows[0] ?? { documentos: false };
  }
  async requireDocuments() {
    if (!(await this.capabilities()).documentos)
      throw new ServiceUnavailableException(
        'Documentos contractuales pendientes de instalar y verificar el esquema',
      );
  }
}
