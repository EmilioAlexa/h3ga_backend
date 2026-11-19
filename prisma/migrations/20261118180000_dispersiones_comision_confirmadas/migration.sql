-- PROPUESTA I5. No aplicar sin autorización expresa de esta migración.
-- Conserva las comisiones, estados e historiales existentes. No migra ni marca pagos históricos.
BEGIN;

CREATE TABLE "dispersiones_comision" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "comision_id" UUID NOT NULL,
  "idempotency_key" UUID NOT NULL,
  "referencia_transferencia" VARCHAR(120) NOT NULL,
  "confirmado_por" UUID NOT NULL,
  "confirmado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "comprobante_path" TEXT NOT NULL,
  "comprobante_sha256" CHAR(64) NOT NULL,
  "comprobante_tamano_bytes" INTEGER NOT NULL,
  CONSTRAINT "dispersiones_comision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_dispersiones_comision" UNIQUE ("comision_id"),
  CONSTRAINT "uq_dispersiones_idempotency_key" UNIQUE ("idempotency_key"),
  CONSTRAINT "ck_dispersiones_referencia_no_vacia" CHECK (length(btrim("referencia_transferencia")) > 0),
  CONSTRAINT "ck_dispersiones_comprobante_valido" CHECK (
    length(btrim("comprobante_path")) > 0
    AND "comprobante_sha256" ~ '^[0-9a-fA-F]{64}$'
    AND "comprobante_tamano_bytes" > 0
  )
);

ALTER TABLE "dispersiones_comision"
  ADD CONSTRAINT "fk_dispersiones_comision"
  FOREIGN KEY ("comision_id") REFERENCES "comisiones"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD CONSTRAINT "fk_dispersiones_confirmador"
  FOREIGN KEY ("confirmado_por") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE INDEX "ix_dispersiones_confirmado_en" ON "dispersiones_comision"("confirmado_en");

COMMIT;
