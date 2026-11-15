-- CreateTable
CREATE TABLE "pension_final_datos_tramite" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "etapa_tramite_id" UUID NOT NULL,
    "institucion" VARCHAR(100),
    "folio_institucional" VARCHAR(100),
    "numero_expediente" VARCHAR(100),
    "fecha_solicitud" DATE,
    "fecha_resolucion" DATE,
    "resultado_resolucion" TEXT,
    "observaciones" TEXT,
    "creado_el" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_el" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pension_final_datos_tramite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "servicios_complementarios_tramite" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cliente_id" UUID NOT NULL,
    "servicio_id" SMALLINT NOT NULL,
    "contrato_id" UUID,
    "estatus_id" SMALLINT NOT NULL,
    "avance_porcentaje" SMALLINT NOT NULL DEFAULT 0,
    "accion_a_realizar" TEXT,
    "fecha_compromiso" DATE,
    "fecha_completada" DATE,
    "reactivado_en" TIMESTAMPTZ(6),
    "motivo_rechazo" TEXT,
    "observaciones" TEXT,
    "creado_el" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_el" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "servicios_complementarios_tramite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "servicios_complementarios_historial" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "servicio_tramite_id" UUID NOT NULL,
    "estatus_anterior_id" SMALLINT,
    "estatus_nuevo_id" SMALLINT NOT NULL,
    "motivo_rechazo" TEXT,
    "cambiado_por" UUID NOT NULL,
    "fecha_cambio" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "servicios_complementarios_historial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "servicios_complementarios_documentos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "servicio_tramite_id" UUID NOT NULL,
    "documento_id" UUID NOT NULL,
    "creado_el" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "servicios_complementarios_documentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "servicios_complementarios_avisos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "servicio_tramite_id" UUID NOT NULL,
    "aviso_id" UUID NOT NULL,

    CONSTRAINT "servicios_complementarios_avisos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pension_final_datos_tramite_etapa_tramite_id_key" ON "pension_final_datos_tramite"("etapa_tramite_id");

-- CreateIndex
CREATE UNIQUE INDEX "servicios_complementarios_avisos_servicio_tramite_id_aviso__key" ON "servicios_complementarios_avisos"("servicio_tramite_id", "aviso_id");

-- AddForeignKey
ALTER TABLE "pension_final_datos_tramite" ADD CONSTRAINT "pension_final_datos_tramite_etapa_tramite_id_fkey" FOREIGN KEY ("etapa_tramite_id") REFERENCES "etapas_tramite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicios_complementarios_tramite" ADD CONSTRAINT "servicios_complementarios_tramite_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicios_complementarios_tramite" ADD CONSTRAINT "servicios_complementarios_tramite_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicios_complementarios_tramite" ADD CONSTRAINT "servicios_complementarios_tramite_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "contratos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicios_complementarios_tramite" ADD CONSTRAINT "servicios_complementarios_tramite_estatus_id_fkey" FOREIGN KEY ("estatus_id") REFERENCES "estatus_tramite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicios_complementarios_historial" ADD CONSTRAINT "servicios_complementarios_historial_servicio_tramite_id_fkey" FOREIGN KEY ("servicio_tramite_id") REFERENCES "servicios_complementarios_tramite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicios_complementarios_historial" ADD CONSTRAINT "servicios_complementarios_historial_estatus_anterior_id_fkey" FOREIGN KEY ("estatus_anterior_id") REFERENCES "estatus_tramite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicios_complementarios_historial" ADD CONSTRAINT "servicios_complementarios_historial_estatus_nuevo_id_fkey" FOREIGN KEY ("estatus_nuevo_id") REFERENCES "estatus_tramite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicios_complementarios_historial" ADD CONSTRAINT "servicios_complementarios_historial_cambiado_por_fkey" FOREIGN KEY ("cambiado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicios_complementarios_documentos" ADD CONSTRAINT "servicios_complementarios_documentos_servicio_tramite_id_fkey" FOREIGN KEY ("servicio_tramite_id") REFERENCES "servicios_complementarios_tramite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicios_complementarios_documentos" ADD CONSTRAINT "servicios_complementarios_documentos_documento_id_fkey" FOREIGN KEY ("documento_id") REFERENCES "documentos_clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicios_complementarios_avisos" ADD CONSTRAINT "servicios_complementarios_avisos_servicio_tramite_id_fkey" FOREIGN KEY ("servicio_tramite_id") REFERENCES "servicios_complementarios_tramite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicios_complementarios_avisos" ADD CONSTRAINT "servicios_complementarios_avisos_aviso_id_fkey" FOREIGN KEY ("aviso_id") REFERENCES "avisos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
