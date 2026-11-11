BEGIN;

-- Preflight: preserve existing history and fail safely when one corte already has
-- multiple prenominas; the API models one generated prenomina per corte.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "prenomina" GROUP BY "corte_id" HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Etapa 10.8: existen varios registros de prenomina para un corte; revisar antes de aplicar.';
  END IF;
END $$;

ALTER TABLE "detalle_prenomina"
  ALTER COLUMN "beneficiario_id" DROP NOT NULL,
  ADD COLUMN "concepto_id" SMALLINT,
  ADD COLUMN "receptor_dispersion_id" UUID,
  ADD COLUMN "receptor_nombre_snapshot" VARCHAR(150);

ALTER TABLE "detalle_prenomina"
  ADD CONSTRAINT "fk_detalle_prenomina_concepto"
    FOREIGN KEY ("concepto_id") REFERENCES "conceptos_dispersion"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD CONSTRAINT "fk_detalle_prenomina_receptor"
    FOREIGN KEY ("receptor_dispersion_id") REFERENCES "receptores_dispersion"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD CONSTRAINT "ck_detalle_prenomina_un_receptor"
    CHECK (num_nonnulls("beneficiario_id", "receptor_dispersion_id") >= 1);

CREATE INDEX "ix_detalle_prenomina_beneficiario"
  ON "detalle_prenomina"("prenomina_id", "beneficiario_id");
CREATE INDEX "ix_detalle_prenomina_receptor"
  ON "detalle_prenomina"("prenomina_id", "receptor_dispersion_id");

CREATE UNIQUE INDEX "uq_prenomina_corte" ON "prenomina"("corte_id");

COMMIT;
