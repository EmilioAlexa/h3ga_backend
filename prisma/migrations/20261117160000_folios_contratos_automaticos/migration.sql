-- I3: solo estructura. No asigna códigos ni modifica folios históricos.
-- Antes de usarla con historia, auditar duplicados normalizados y máximos
-- por servicio/año en una copia autorizada. Un duplicado hará fallar el índice.
ALTER TABLE "servicios" ADD COLUMN "codigo_folio" VARCHAR(4);

ALTER TABLE "servicios" ADD CONSTRAINT "ck_servicios_codigo_folio"
  CHECK ("codigo_folio" IS NULL OR "codigo_folio" IN ('APD', 'M10', 'M40', 'M40R'));

CREATE UNIQUE INDEX "uq_servicios_codigo_folio" ON "servicios"("codigo_folio");

CREATE TABLE "folios_contrato_contadores" (
  "servicio_id" SMALLINT NOT NULL,
  "anio" SMALLINT NOT NULL,
  "ultimo" BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT "pk_folios_contrato_contadores" PRIMARY KEY ("servicio_id", "anio"),
  CONSTRAINT "ck_folios_contrato_anio" CHECK ("anio" BETWEEN 2000 AND 9999),
  CONSTRAINT "ck_folios_contrato_ultimo" CHECK ("ultimo" >= 0),
  CONSTRAINT "fk_folios_contrato_contadores_servicio"
    FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- PostgreSQL es la barrera definitiva ante folios iguales con variaciones
-- de espacios o mayúsculas. Esta expresión no se representa en Prisma schema.
CREATE UNIQUE INDEX "uq_contratos_folio_normalizado"
  ON "contratos" ((upper(btrim("folio"))));
