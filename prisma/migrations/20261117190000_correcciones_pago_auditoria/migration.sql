-- I4: propuesta incremental. No aplicar sin autorización expresa.
-- Conserva pagos y evidencias existentes. El default considera vigentes las
-- evidencias históricas porque antes no existía corrección estructurada.
CREATE TABLE "correcciones_pago" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "pago_id" UUID NOT NULL,
  "actor_id" UUID NOT NULL,
  "fecha_correccion" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "motivo" VARCHAR(1000) NOT NULL,
  "estado_anterior_id" SMALLINT NOT NULL,
  "estado_nuevo_id" SMALLINT NOT NULL,
  "monto_anterior" DECIMAL(12,2) NOT NULL,
  "monto_nuevo" DECIMAL(12,2) NOT NULL,
  "fecha_pago_anterior" TIMESTAMPTZ(6),
  "fecha_pago_nueva" TIMESTAMPTZ(6) NOT NULL,
  "forma_pago_id_anterior" SMALLINT,
  "forma_pago_id_nueva" SMALLINT NOT NULL,
  "observaciones_anteriores" TEXT,
  "observaciones_nuevas" TEXT,
  "folio_recibo_anterior" VARCHAR(100),
  "folio_recibo_nuevo" VARCHAR(100),
  "recibido_por_anterior" UUID,
  "recibido_por_nuevo" UUID,
  "lugar_recepcion_anterior" VARCHAR(150),
  "lugar_recepcion_nuevo" VARCHAR(150),
  "historial_estado_id" UUID NOT NULL,
  CONSTRAINT "pk_correcciones_pago" PRIMARY KEY ("id"),
  CONSTRAINT "uq_correcciones_pago_historial" UNIQUE ("historial_estado_id"),
  CONSTRAINT "ck_correcciones_pago_motivo" CHECK (btrim("motivo") <> ''),
  CONSTRAINT "ck_correcciones_pago_monto" CHECK ("monto_anterior" > 0 AND "monto_nuevo" > 0),
  CONSTRAINT "fk_correcciones_pago_pago" FOREIGN KEY ("pago_id") REFERENCES "pagos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "fk_correcciones_pago_actor" FOREIGN KEY ("actor_id") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "fk_correcciones_pago_historial" FOREIGN KEY ("historial_estado_id") REFERENCES "historial_estados_pago"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "fk_correcciones_pago_estado_anterior" FOREIGN KEY ("estado_anterior_id") REFERENCES "estados_pago"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "fk_correcciones_pago_estado_nuevo" FOREIGN KEY ("estado_nuevo_id") REFERENCES "estados_pago"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE INDEX "ix_correcciones_pago_pago_fecha" ON "correcciones_pago"("pago_id", "fecha_correccion");
CREATE INDEX "ix_correcciones_pago_actor" ON "correcciones_pago"("actor_id");

ALTER TABLE "evidencias_pago"
  ADD COLUMN "vigente" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "correccion_origen_id" UUID,
  ADD COLUMN "correccion_sustitucion_id" UUID;

ALTER TABLE "evidencias_pago"
  ADD CONSTRAINT "fk_evidencias_correccion_origen" FOREIGN KEY ("correccion_origen_id") REFERENCES "correcciones_pago"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD CONSTRAINT "fk_evidencias_correccion_sustitucion" FOREIGN KEY ("correccion_sustitucion_id") REFERENCES "correcciones_pago"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD CONSTRAINT "ck_evidencias_vigencia_correccion"
    CHECK (("vigente" AND "correccion_sustitucion_id" IS NULL)
        OR (NOT "vigente" AND "correccion_sustitucion_id" IS NOT NULL));

CREATE INDEX "ix_evidencias_pago_vigentes" ON "evidencias_pago"("pago_id", "tipo_evidencia_id") WHERE "vigente";
CREATE INDEX "ix_evidencias_correccion_origen" ON "evidencias_pago"("correccion_origen_id");
CREATE INDEX "ix_evidencias_correccion_sustitucion" ON "evidencias_pago"("correccion_sustitucion_id");
