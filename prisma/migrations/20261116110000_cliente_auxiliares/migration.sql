-- RF-40/RF-41: asignaciones operativas entre clientes y auxiliares.
CREATE TABLE "cliente_auxiliares" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cliente_id" UUID NOT NULL,
    "auxiliar_id" UUID NOT NULL,
    "autorizado_por" UUID NOT NULL,
    "fecha_autorizacion" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "cliente_auxiliares_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cliente_auxiliares_cliente_id_auxiliar_id_key"
ON "cliente_auxiliares"("cliente_id", "auxiliar_id");
CREATE INDEX "cliente_auxiliares_auxiliar_id_activo_idx"
ON "cliente_auxiliares"("auxiliar_id", "activo");
CREATE INDEX "cliente_auxiliares_cliente_id_activo_idx"
ON "cliente_auxiliares"("cliente_id", "activo");

ALTER TABLE "cliente_auxiliares"
ADD CONSTRAINT "cliente_auxiliares_cliente_id_fkey"
FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cliente_auxiliares"
ADD CONSTRAINT "cliente_auxiliares_auxiliar_id_fkey"
FOREIGN KEY ("auxiliar_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cliente_auxiliares"
ADD CONSTRAINT "cliente_auxiliares_autorizado_por_fkey"
FOREIGN KEY ("autorizado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
