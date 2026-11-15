-- Agregar etapa opcional a tareas de auxiliares
ALTER TABLE "tareas_auxiliar"
ADD COLUMN "etapa_tramite_id" UUID;

-- Agregar metadatos a las versiones de documentos
ALTER TABLE "versiones_documento"
ADD COLUMN "nombre_archivo_original" TEXT,
ADD COLUMN "mime_type" VARCHAR(100);

-- Relacionar tareas de auxiliares con etapas del trámite
ALTER TABLE "tareas_auxiliar"
ADD CONSTRAINT "fk_tareas_auxiliar_etapa_tramite"
FOREIGN KEY ("etapa_tramite_id")
REFERENCES "etapas_tramite"("id")
ON DELETE NO ACTION
ON UPDATE NO ACTION;