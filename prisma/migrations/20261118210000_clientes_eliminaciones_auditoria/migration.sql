-- I7: auditoría mínima de eliminaciones físicas de clientes sin dependencias.
-- cliente_id NO tiene FK intencionalmente: el cliente ya no existe tras el DELETE.
-- Aplicar solo después de aprobación técnica y preflight del destino.
CREATE TABLE "clientes_eliminaciones" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "cliente_id" UUID NOT NULL,
  "eliminado_por" UUID NOT NULL,
  "eliminado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "clientes_eliminaciones_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fk_clientes_eliminaciones_actor" FOREIGN KEY ("eliminado_por")
    REFERENCES "usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE INDEX "ix_clientes_eliminaciones_cliente" ON "clientes_eliminaciones"("cliente_id");
CREATE INDEX "ix_clientes_eliminaciones_actor_fecha" ON "clientes_eliminaciones"("eliminado_por", "eliminado_en");
