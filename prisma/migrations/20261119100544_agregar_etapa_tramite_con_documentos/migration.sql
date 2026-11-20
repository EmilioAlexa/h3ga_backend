-- AlterTable
ALTER TABLE "documentos_clientes"
ADD COLUMN "etapa_tramite_id" UUID;

-- AddForeignKey
ALTER TABLE "documentos_clientes"
ADD CONSTRAINT "documentos_clientes_etapa_tramite_id_fkey"
FOREIGN KEY ("etapa_tramite_id")
REFERENCES "etapas_tramite"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;