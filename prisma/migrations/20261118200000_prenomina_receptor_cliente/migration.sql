-- Incremental: habilita un cliente referidor identificable en cada detalle de prenómina.
-- Conserva las filas y la semántica previa de al menos un receptor (>= 1).
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'detalle_prenomina'::regclass
      AND conname = 'ck_detalle_prenomina_un_receptor'
  ) THEN
    RAISE EXCEPTION 'Falta el CHECK vigente de detalle_prenomina; revisar el esquema antes de migrar';
  END IF;
END $$;

ALTER TABLE "detalle_prenomina"
  ADD COLUMN "receptor_cliente_id" UUID;

ALTER TABLE "detalle_prenomina"
  ADD CONSTRAINT "fk_detalle_prenomina_receptor_cliente"
  FOREIGN KEY ("receptor_cliente_id") REFERENCES "clientes"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE INDEX "ix_detalle_prenomina_receptor_cliente_id"
  ON "detalle_prenomina"("receptor_cliente_id");

ALTER TABLE "detalle_prenomina"
  DROP CONSTRAINT "ck_detalle_prenomina_un_receptor";

ALTER TABLE "detalle_prenomina"
  ADD CONSTRAINT "ck_detalle_prenomina_un_receptor"
  CHECK (num_nonnulls("beneficiario_id", "receptor_dispersion_id", "receptor_cliente_id") >= 1);

COMMIT;
