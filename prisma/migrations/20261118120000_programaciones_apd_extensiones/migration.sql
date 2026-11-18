-- Propuesta incremental para I4. NO APLICAR sin autorización expresa.
-- Las columnas opcionales preservan todas las filas históricas.
CREATE TYPE "ClasificacionTopeApd" AS ENUM ('TOPADO', 'NO_TOPADO');

-- Los IDs los asigna PostgreSQL. Se conservan filas y referencias previas.
-- Auditar nombres equivalentes en el entorno de destino antes de desplegar.
INSERT INTO "estados_pago_programado" ("nombre", "descripcion") VALUES
  ('Pendiente', 'Obligación con importe por cubrir y fecha límite no vencida'),
  ('Cubierto', 'Importe cubierto por pagos validados'),
  ('Vencido', 'Obligación no cubierta después de la fecha de vencimiento'),
  ('Cancelado', 'Obligación cancelada por una acción administrativa autorizada')
ON CONFLICT ("nombre") DO NOTHING;

ALTER TABLE "pagos_programados"
  ADD COLUMN "justificacion_duplicado" TEXT,
  ADD COLUMN "motivo_penalizacion" TEXT,
  ADD COLUMN "clasificacion_tope_apd" "ClasificacionTopeApd",
  ADD COLUMN "monto_recibido_beneficiario_apd" DECIMAL(12,2);

ALTER TABLE "pagos_programados"
  ADD CONSTRAINT "ck_programado_justificacion_duplicado_no_vacia"
    CHECK ("justificacion_duplicado" IS NULL OR btrim("justificacion_duplicado") <> ''),
  ADD CONSTRAINT "ck_programado_motivo_penalizacion_no_vacio"
    CHECK ("motivo_penalizacion" IS NULL OR btrim("motivo_penalizacion") <> ''),
  ADD CONSTRAINT "ck_programado_monto_beneficiario_no_negativo"
    CHECK ("monto_recibido_beneficiario_apd" IS NULL OR "monto_recibido_beneficiario_apd" >= 0);

CREATE INDEX "ix_programados_coincidencia"
  ON "pagos_programados" ("contrato_id", "fecha_esperada", "monto_esperado");

-- No se crea UNIQUE(contrato_id, fecha_esperada, monto_esperado):
-- las duplicaciones justificadas están permitidas. El servicio deberá
-- serializar create/update por la misma clave con advisory lock transaccional.
