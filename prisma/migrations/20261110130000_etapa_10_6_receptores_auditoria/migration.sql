CREATE TABLE "receptores_dispersion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "concepto_id" SMALLINT NOT NULL,
    "usuario_id" UUID,
    "nombre_externo" VARCHAR(150),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_por" UUID,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "receptores_dispersion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_receptor_dispersion_identidad" CHECK (
      ("usuario_id" IS NOT NULL AND "nombre_externo" IS NULL)
      OR
      ("usuario_id" IS NULL AND NULLIF(BTRIM("nombre_externo"), '') IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "uq_receptor_dispersion_concepto_usuario"
  ON "receptores_dispersion"("concepto_id", "usuario_id");
CREATE UNIQUE INDEX "uq_receptor_dispersion_concepto_externo"
  ON "receptores_dispersion"("concepto_id", "nombre_externo");
CREATE INDEX "ix_receptores_dispersion_concepto_activo"
  ON "receptores_dispersion"("concepto_id", "activo");

ALTER TABLE "receptores_dispersion"
  ADD CONSTRAINT "fk_receptores_dispersion_concepto"
  FOREIGN KEY ("concepto_id") REFERENCES "conceptos_dispersion"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "receptores_dispersion"
  ADD CONSTRAINT "fk_receptores_dispersion_usuario"
  FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "receptores_dispersion"
  ADD CONSTRAINT "fk_receptores_dispersion_creador"
  FOREIGN KEY ("creado_por") REFERENCES "usuarios"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "contrato_dispersion_detalle"
  ADD COLUMN "receptor_dispersion_id" UUID;
CREATE INDEX "ix_cdd_receptor_dispersion"
  ON "contrato_dispersion_detalle"("receptor_dispersion_id");
ALTER TABLE "contrato_dispersion_detalle"
  ADD CONSTRAINT "fk_detalle_dispersion_receptor"
  FOREIGN KEY ("receptor_dispersion_id") REFERENCES "receptores_dispersion"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "comisiones"
  ADD COLUMN "receptor_dispersion_id" UUID,
  ADD COLUMN "receptor_nombre_snapshot" VARCHAR(150);
CREATE INDEX "ix_comisiones_receptor_dispersion"
  ON "comisiones"("receptor_dispersion_id");
ALTER TABLE "comisiones"
  ADD CONSTRAINT "fk_comisiones_receptor_dispersion"
  FOREIGN KEY ("receptor_dispersion_id") REFERENCES "receptores_dispersion"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE TABLE "historial_estados_comisiones" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "comision_id" UUID NOT NULL,
    "estado_anterior_id" SMALLINT,
    "estado_nuevo_id" SMALLINT NOT NULL,
    "cambiado_por" UUID NOT NULL,
    "fecha_cambio" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comentario" TEXT,
    CONSTRAINT "historial_estados_comisiones_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ix_historial_estado_comision_fecha"
  ON "historial_estados_comisiones"("comision_id", "fecha_cambio");
ALTER TABLE "historial_estados_comisiones"
  ADD CONSTRAINT "fk_historial_estado_comision"
  FOREIGN KEY ("comision_id") REFERENCES "comisiones"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "historial_estados_comisiones"
  ADD CONSTRAINT "fk_historial_estado_comision_anterior"
  FOREIGN KEY ("estado_anterior_id") REFERENCES "estados_comisiones"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "historial_estados_comisiones"
  ADD CONSTRAINT "fk_historial_estado_comision_nuevo"
  FOREIGN KEY ("estado_nuevo_id") REFERENCES "estados_comisiones"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "historial_estados_comisiones"
  ADD CONSTRAINT "fk_historial_estado_comision_usuario"
  FOREIGN KEY ("cambiado_por") REFERENCES "usuarios"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE TABLE "historial_configuracion_dispersion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contrato_id" UUID NOT NULL,
    "cambiado_por" UUID NOT NULL,
    "fecha_cambio" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accion" VARCHAR(30) NOT NULL,
    "configuracion_anterior" JSONB,
    "configuracion_nueva" JSONB,
    CONSTRAINT "historial_configuracion_dispersion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ix_historial_dispersion_contrato_fecha"
  ON "historial_configuracion_dispersion"("contrato_id", "fecha_cambio");
ALTER TABLE "historial_configuracion_dispersion"
  ADD CONSTRAINT "fk_historial_dispersion_contrato"
  FOREIGN KEY ("contrato_id") REFERENCES "contratos"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "historial_configuracion_dispersion"
  ADD CONSTRAINT "fk_historial_dispersion_usuario"
  FOREIGN KEY ("cambiado_por") REFERENCES "usuarios"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Canonical business destinations from the Plan Maestro; no receiver or rate demo data.
INSERT INTO "conceptos_dispersion"
  ("nombre", "tipo_destino", "incluye_en_prenomina", "es_remanente", "orden", "activo")
VALUES
  ('Asesor', 'usuario', true, false, 1, true),
  ('Director', 'usuario', true, false, 2, true),
  ('Gerente', 'usuario', true, false, 3, true),
  ('IMSS', 'externo', false, false, 4, true),
  ('Referidor', 'externo', true, false, 5, true),
  ('Bróker', 'externo', true, false, 6, true),
  ('Empresa', 'empresa', false, true, 7, true)
ON CONFLICT DO NOTHING;

INSERT INTO "estados_comisiones" ("nombre", "descripcion")
VALUES
  ('Pendiente de dispersión', 'Comisión calculada al validar el pago; pendiente de confirmar su transferencia.'),
  ('Dispersada', 'Administración confirmó la transferencia real de la comisión.')
ON CONFLICT ("nombre") DO NOTHING;
