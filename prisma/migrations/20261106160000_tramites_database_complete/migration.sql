-- CreateEnum
CREATE TYPE "estatus_tarea_auxiliar" AS ENUM ('pendiente', 'en_proceso', 'en_revision', 'correcciones', 'validada', 'cancelada');

-- CreateEnum
CREATE TYPE "resultado_revision" AS ENUM ('validado', 'no_validado');

-- CreateEnum
CREATE TYPE "tipo_formato" AS ENUM ('pdf', 'word', 'enlace');

-- DropForeignKey
ALTER TABLE "modalidades_aplicacion" DROP CONSTRAINT "fk_modalidades_aplicacion_estatus_m10";

-- DropForeignKey
ALTER TABLE "modalidades_aplicacion" DROP CONSTRAINT "fk_modalidades_aplicacion_estatus_m40";

-- DropForeignKey
ALTER TABLE "modalidades_aplicacion" DROP CONSTRAINT "fk_modalidades_aplicacion_estatus_m40r";

-- AlterTable
ALTER TABLE "modalidades_aplicacion" ADD COLUMN     "actualizado_el" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "aplica_m10" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "aplica_m40" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "aplica_m40r" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fase_m10_id" SMALLINT,
ADD COLUMN     "fase_m40_id" SMALLINT,
ADD COLUMN     "fase_m40r_id" SMALLINT,
ADD COLUMN     "motivo_cierre" TEXT;

-- DropTable
DROP TABLE "estatus_modalidad";

-- CreateTable
CREATE TABLE "dependencias_formato" (
    "id" SMALLSERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "dependencias_formato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "envios_documento" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cliente_id" UUID NOT NULL,
    "tarea_id" UUID,
    "titulo" TEXT NOT NULL,
    "tipo_documento_id" SMALLINT NOT NULL,
    "creado_por" UUID NOT NULL,
    "estatus_id" SMALLINT NOT NULL DEFAULT 1,
    "documento_cliente_id" UUID,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cerrado_en" TIMESTAMPTZ(6),

    CONSTRAINT "envios_documento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estatus_envio_documento" (
    "id" SMALLSERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" SMALLINT NOT NULL,
    "es_final" BOOLEAN NOT NULL,

    CONSTRAINT "estatus_envio_documento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fase_modalidad" (
    "id" SMALLSERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" SMALLINT NOT NULL,

    CONSTRAINT "fase_modalidad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "formatos_institucionales" (
    "id" SMALLSERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "dependencia_id" SMALLINT NOT NULL,
    "tipo_formato" "tipo_formato" NOT NULL,
    "enlace_url" TEXT,
    "archivo_path" TEXT,
    "creado_por" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_por" UUID,
    "actualizado_en" TIMESTAMPTZ(6),
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "formatos_institucionales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tareas_auxiliar" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cliente_id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "instrucciones" TEXT NOT NULL,
    "asignado_por" UUID NOT NULL,
    "auxiliar_id" UUID NOT NULL,
    "estatus" "estatus_tarea_auxiliar" NOT NULL DEFAULT 'pendiente',
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completado_en" TIMESTAMPTZ(6),
    "validado_por" UUID,
    "validado_en" TIMESTAMPTZ(6),

    CONSTRAINT "tareas_auxiliar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "versiones_documento" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "envio_id" UUID NOT NULL,
    "numero_version" SMALLINT NOT NULL,
    "archivo_path" TEXT NOT NULL,
    "hash_archivo" VARCHAR(128),
    "subido_por" UUID NOT NULL,
    "fecha_carga" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resultado" "resultado_revision",
    "comentario" TEXT,
    "revisor_id" UUID,
    "fecha_revision" TIMESTAMPTZ(6),

    CONSTRAINT "versiones_documento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dependencias_formato_nombre_key" ON "dependencias_formato"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "estatus_envio_documento_nombre_key" ON "estatus_envio_documento"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "fase_modalidad_nombre_key" ON "fase_modalidad"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "formatos_institucionales_nombre_key" ON "formatos_institucionales"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "versiones_documento_envio_id_numero_version_key" ON "versiones_documento"("envio_id", "numero_version");

-- AddForeignKey
ALTER TABLE "modalidades_aplicacion" ADD CONSTRAINT "fk_modalidades_aplicacion_estatus_m10" FOREIGN KEY ("estatus_m10_id") REFERENCES "estatus_tramite"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "modalidades_aplicacion" ADD CONSTRAINT "fk_modalidades_aplicacion_estatus_m40" FOREIGN KEY ("estatus_m40_id") REFERENCES "estatus_tramite"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "modalidades_aplicacion" ADD CONSTRAINT "fk_modalidades_aplicacion_estatus_m40r" FOREIGN KEY ("estatus_m40r_id") REFERENCES "estatus_tramite"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "modalidades_aplicacion" ADD CONSTRAINT "modalidades_aplicacion_fase_m10_id_fkey" FOREIGN KEY ("fase_m10_id") REFERENCES "fase_modalidad"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modalidades_aplicacion" ADD CONSTRAINT "modalidades_aplicacion_fase_m40_id_fkey" FOREIGN KEY ("fase_m40_id") REFERENCES "fase_modalidad"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modalidades_aplicacion" ADD CONSTRAINT "modalidades_aplicacion_fase_m40r_id_fkey" FOREIGN KEY ("fase_m40r_id") REFERENCES "fase_modalidad"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envios_documento" ADD CONSTRAINT "envios_documento_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envios_documento" ADD CONSTRAINT "envios_documento_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envios_documento" ADD CONSTRAINT "envios_documento_documento_cliente_id_fkey" FOREIGN KEY ("documento_cliente_id") REFERENCES "documentos_clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envios_documento" ADD CONSTRAINT "envios_documento_estatus_id_fkey" FOREIGN KEY ("estatus_id") REFERENCES "estatus_envio_documento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envios_documento" ADD CONSTRAINT "envios_documento_tarea_id_fkey" FOREIGN KEY ("tarea_id") REFERENCES "tareas_auxiliar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envios_documento" ADD CONSTRAINT "envios_documento_tipo_documento_id_fkey" FOREIGN KEY ("tipo_documento_id") REFERENCES "tipo_documento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formatos_institucionales" ADD CONSTRAINT "formatos_institucionales_actualizado_por_fkey" FOREIGN KEY ("actualizado_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formatos_institucionales" ADD CONSTRAINT "formatos_institucionales_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formatos_institucionales" ADD CONSTRAINT "formatos_institucionales_dependencia_id_fkey" FOREIGN KEY ("dependencia_id") REFERENCES "dependencias_formato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tareas_auxiliar" ADD CONSTRAINT "tareas_auxiliar_asignado_por_fkey" FOREIGN KEY ("asignado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tareas_auxiliar" ADD CONSTRAINT "tareas_auxiliar_auxiliar_id_fkey" FOREIGN KEY ("auxiliar_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tareas_auxiliar" ADD CONSTRAINT "tareas_auxiliar_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tareas_auxiliar" ADD CONSTRAINT "tareas_auxiliar_validado_por_fkey" FOREIGN KEY ("validado_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "versiones_documento" ADD CONSTRAINT "versiones_documento_envio_id_fkey" FOREIGN KEY ("envio_id") REFERENCES "envios_documento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "versiones_documento" ADD CONSTRAINT "versiones_documento_revisor_id_fkey" FOREIGN KEY ("revisor_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "versiones_documento" ADD CONSTRAINT "versiones_documento_subido_por_fkey" FOREIGN KEY ("subido_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Restricciones CHECK recuperadas de PostgreSQL

ALTER TABLE formatos_institucionales
ADD CONSTRAINT formatos_institucionales_origen_check
CHECK (
    (
        tipo_formato = 'enlace'::tipo_formato
        AND NULLIF(btrim(enlace_url), '') IS NOT NULL
        AND archivo_path IS NULL
    )
    OR
    (
        tipo_formato IN ('pdf'::tipo_formato, 'word'::tipo_formato)
        AND NULLIF(btrim(archivo_path), '') IS NOT NULL
        AND enlace_url IS NULL
    )
);

ALTER TABLE versiones_documento
ADD CONSTRAINT versiones_documento_comentario_check
CHECK (
    resultado IS DISTINCT FROM 'no_validado'::resultado_revision
    OR NULLIF(btrim(comentario), '') IS NOT NULL
);

ALTER TABLE versiones_documento
ADD CONSTRAINT versiones_documento_numero_positivo_check
CHECK (numero_version >= 1);

ALTER TABLE versiones_documento
ADD CONSTRAINT versiones_documento_revision_check
CHECK (
    (
        resultado IS NULL
        AND revisor_id IS NULL
        AND fecha_revision IS NULL
    )
    OR
    (
        resultado IS NOT NULL
        AND revisor_id IS NOT NULL
        AND fecha_revision IS NOT NULL
    )
);

-- Catálogos H3GA: agregar una sola vez al FINAL de migracion_consolidada.sql
-- NO ejecutar sobre h3ga; solo en una base nueva que aplique la migración.

INSERT INTO public.estatus_tramite (id, nombre, descripcion, categoria, avance_porcentaje_fijo, avance_editable, avance_min, avance_max) VALUES (1, 'No aplica', NULL, 'no_aplica', NULL, FALSE, NULL, NULL);
INSERT INTO public.estatus_tramite (id, nombre, descripcion, categoria, avance_porcentaje_fijo, avance_editable, avance_min, avance_max) VALUES (2, 'Por iniciar', NULL, 'pendiente', 10, FALSE, NULL, NULL);
INSERT INTO public.estatus_tramite (id, nombre, descripcion, categoria, avance_porcentaje_fijo, avance_editable, avance_min, avance_max) VALUES (3, 'En proceso cliente', NULL, 'en_proceso', NULL, TRUE, 20, 90);
INSERT INTO public.estatus_tramite (id, nombre, descripcion, categoria, avance_porcentaje_fijo, avance_editable, avance_min, avance_max) VALUES (4, 'En proceso asesor', NULL, 'en_proceso', NULL, TRUE, 20, 90);
INSERT INTO public.estatus_tramite (id, nombre, descripcion, categoria, avance_porcentaje_fijo, avance_editable, avance_min, avance_max) VALUES (5, 'En proceso Instituto', NULL, 'en_proceso', NULL, TRUE, 20, 90);
INSERT INTO public.estatus_tramite (id, nombre, descripcion, categoria, avance_porcentaje_fijo, avance_editable, avance_min, avance_max) VALUES (6, 'Finalizado', NULL, 'completado', 100, FALSE, NULL, NULL);
INSERT INTO public.estatus_tramite (id, nombre, descripcion, categoria, avance_porcentaje_fijo, avance_editable, avance_min, avance_max) VALUES (7, 'Bloqueado', NULL, 'excepcion', NULL, FALSE, NULL, NULL);
INSERT INTO public.estatus_tramite (id, nombre, descripcion, categoria, avance_porcentaje_fijo, avance_editable, avance_min, avance_max) VALUES (8, 'Cancelado', NULL, 'excepcion', NULL, FALSE, NULL, NULL);
INSERT INTO public.estatus_tramite (id, nombre, descripcion, categoria, avance_porcentaje_fijo, avance_editable, avance_min, avance_max) VALUES (9, 'Detenido', NULL, 'excepcion', NULL, FALSE, NULL, NULL);

INSERT INTO public.fase_modalidad (id, nombre, orden) VALUES (1, 'Prospecto', 1);
INSERT INTO public.fase_modalidad (id, nombre, orden) VALUES (2, 'Documentación', 2);
INSERT INTO public.fase_modalidad (id, nombre, orden) VALUES (3, 'En análisis', 3);
INSERT INTO public.fase_modalidad (id, nombre, orden) VALUES (4, 'Cotización', 4);
INSERT INTO public.fase_modalidad (id, nombre, orden) VALUES (5, 'Autorizado', 5);
INSERT INTO public.objetivo_modalidad_10 (id, nombre) VALUES (1, 'Tener cobertura médica y prestaciones');
INSERT INTO public.objetivo_modalidad_10 (id, nombre) VALUES (2, 'Seguir generando semanas');
INSERT INTO public.objetivo_modalidad_10 (id, nombre) VALUES (3, 'Reactivar derechos');
INSERT INTO public.objetivo_modalidad_10 (id, nombre) VALUES (4, 'Mejorar continuidad de cotización');
INSERT INTO public.objetivo_modalidad_10 (id, nombre) VALUES (5, 'Evaluar transición posterior a Modalidad 40');
INSERT INTO public.objetivo_modalidad_10 (id, nombre) VALUES (6, 'Otro');
INSERT INTO public.objetivo_modalidad_40 (id, nombre) VALUES (1, 'Aumentar salario promedio');
INSERT INTO public.objetivo_modalidad_40 (id, nombre) VALUES (2, 'Completar semanas faltantes');
INSERT INTO public.objetivo_modalidad_40 (id, nombre) VALUES (3, 'Mejorar pensión Ley 73');
INSERT INTO public.objetivo_modalidad_40 (id, nombre) VALUES (4, 'Mantener cotización para pensión');
INSERT INTO public.objetivo_modalidad_40 (id, nombre) VALUES (5, 'Reingresar tras baja por mora');
INSERT INTO public.objetivo_modalidad_40 (id, nombre) VALUES (6, 'Otro');
INSERT INTO public.estatus_envio_documento (id, nombre, orden, es_final) VALUES (1, 'Pendiente', 1, FALSE);
INSERT INTO public.estatus_envio_documento (id, nombre, orden, es_final) VALUES (2, 'No validado', 2, FALSE);
INSERT INTO public.estatus_envio_documento (id, nombre, orden, es_final) VALUES (3, 'Validado', 3, TRUE);
INSERT INTO public.estatus_envio_documento (id, nombre, orden, es_final) VALUES (4, 'Cancelado', 4, TRUE);

SELECT setval(pg_get_serial_sequence('public.fase_modalidad', 'id'), (SELECT MAX(id) FROM public.fase_modalidad), true);
SELECT setval(pg_get_serial_sequence('public.estatus_tramite', 'id'), (SELECT MAX(id) FROM public.estatus_tramite), true);
SELECT setval(pg_get_serial_sequence('public.objetivo_modalidad_10', 'id'), (SELECT MAX(id) FROM public.objetivo_modalidad_10), true);
SELECT setval(pg_get_serial_sequence('public.objetivo_modalidad_40', 'id'), (SELECT MAX(id) FROM public.objetivo_modalidad_40), true);
SELECT setval(pg_get_serial_sequence('public.estatus_envio_documento', 'id'), (SELECT MAX(id) FROM public.estatus_envio_documento), true);
