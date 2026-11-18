-- Propuesta separada para cancelar obligaciones con auditoría.
-- NO APLICAR: requiere autorización expresa distinta de la migración de extensiones APD.
ALTER TABLE "pagos_programados"
  ADD COLUMN "cancelado_por" UUID,
  ADD COLUMN "cancelado_en" TIMESTAMPTZ(6),
  ADD COLUMN "motivo_cancelacion" TEXT;

ALTER TABLE "pagos_programados"
  ADD CONSTRAINT "fk_programados_cancelado_por"
    FOREIGN KEY ("cancelado_por") REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD CONSTRAINT "ck_programados_auditoria_cancelacion_completa"
    CHECK (
      ("cancelado_por" IS NULL AND "cancelado_en" IS NULL AND "motivo_cancelacion" IS NULL)
      OR
      ("cancelado_por" IS NOT NULL AND "cancelado_en" IS NOT NULL AND "motivo_cancelacion" IS NOT NULL AND btrim("motivo_cancelacion") <> '')
    );
