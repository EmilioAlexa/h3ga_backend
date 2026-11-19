-- Preparada para revisión. NO APLICAR sin autorización expresa.
-- Conserva clientes.referido_por y todas las filas históricas sin conversiones.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "conceptos_dispersion"
    WHERE lower(btrim("nombre")) = lower('Otro')
  ) THEN
    RAISE EXCEPTION 'El concepto Otro ya existe; revisar catálogo antes de aplicar esta migración';
  END IF;
END $$;

ALTER TABLE "clientes"
  ADD COLUMN "referido_por_cliente_id" UUID;

ALTER TABLE "clientes"
  ADD CONSTRAINT "ck_clientes_referido_por_distinto"
  CHECK ("referido_por_cliente_id" IS NULL OR "referido_por_cliente_id" <> "id");

ALTER TABLE "clientes"
  ADD CONSTRAINT "fk_clientes_referido_por_cliente"
  FOREIGN KEY ("referido_por_cliente_id") REFERENCES "clientes"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE INDEX "ix_clientes_referido_por_cliente_id"
  ON "clientes"("referido_por_cliente_id");

ALTER TABLE "comisiones"
  ADD COLUMN "receptor_cliente_id" UUID;

-- El nombre completo del cliente referidor puede exceder 150 caracteres.
ALTER TABLE "comisiones"
  ALTER COLUMN "receptor_nombre_snapshot" TYPE TEXT;

ALTER TABLE "comisiones"
  ADD CONSTRAINT "fk_comisiones_receptor_cliente"
  FOREIGN KEY ("receptor_cliente_id") REFERENCES "clientes"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE INDEX "ix_comisiones_receptor_cliente_id"
  ON "comisiones"("receptor_cliente_id");

CREATE TABLE "historial_referidor_cliente" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "cliente_id" UUID NOT NULL,
  "referidor_anterior_id" UUID,
  "referidor_nuevo_id" UUID,
  "actor_id" UUID NOT NULL,
  "motivo" TEXT NOT NULL,
  "fecha_cambio" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "historial_referidor_cliente_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ck_historial_referidor_motivo" CHECK (NULLIF(btrim("motivo"), '') IS NOT NULL),
  CONSTRAINT "ck_historial_referidor_cambio" CHECK ("referidor_anterior_id" IS DISTINCT FROM "referidor_nuevo_id"),
  CONSTRAINT "fk_historial_referidor_titular" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "fk_historial_referidor_anterior" FOREIGN KEY ("referidor_anterior_id") REFERENCES "clientes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "fk_historial_referidor_nuevo" FOREIGN KEY ("referidor_nuevo_id") REFERENCES "clientes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "fk_historial_referidor_actor" FOREIGN KEY ("actor_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE INDEX "ix_historial_referidor_cliente_fecha"
  ON "historial_referidor_cliente"("cliente_id", "fecha_cambio");
CREATE INDEX "ix_historial_referidor_anterior"
  ON "historial_referidor_cliente"("referidor_anterior_id");
CREATE INDEX "ix_historial_referidor_nuevo"
  ON "historial_referidor_cliente"("referidor_nuevo_id");
CREATE INDEX "ix_historial_referidor_actor"
  ON "historial_referidor_cliente"("actor_id");

INSERT INTO "conceptos_dispersion"
  ("nombre", "descripcion", "tipo_destino", "incluye_en_prenomina", "es_remanente", "orden", "activo")
VALUES
  ('Otro', 'Destino de distribución con descripción obligatoria', 'externo', false, false, 8, true);

COMMIT;
