ALTER TABLE "pagos"
  ADD COLUMN "folio_recibo" VARCHAR(100),
  ADD COLUMN "recibido_por" UUID,
  ADD COLUMN "lugar_recepcion" VARCHAR(150);

ALTER TABLE "pagos"
  ADD CONSTRAINT "fk_pagos_recibido_por"
  FOREIGN KEY ("recibido_por") REFERENCES "usuarios"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE INDEX "pagos_recibido_por_idx" ON "pagos"("recibido_por");

INSERT INTO "estados_pago" ("nombre", "orden") VALUES
  ('Pendiente de revisión financiera', 1),
  ('Rechazado', 2),
  ('Pendiente de autorización', 3),
  ('Validado', 4),
  ('Cancelado', 5)
ON CONFLICT ("nombre") DO UPDATE SET "orden" = EXCLUDED."orden";

INSERT INTO "tipos_evidencia_pago" ("nombre", "descripcion") VALUES
  ('Comprobante de efectivo', 'Evidencia correspondiente a un pago recibido en efectivo.'),
  ('Comprobante bancario', 'Comprobante de transferencia o depósito bancario.'),
  ('Comprobante de cheque', 'Evidencia correspondiente a un pago realizado con cheque.')
ON CONFLICT ("nombre") DO UPDATE SET "descripcion" = EXCLUDED."descripcion";
