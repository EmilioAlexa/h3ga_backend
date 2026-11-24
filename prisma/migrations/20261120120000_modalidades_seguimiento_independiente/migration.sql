-- PREPARADA, NO EJECUTADA. Dominio operativo RUTA H3GA exclusivamente.
-- Respaldo y autorización de ejecución requeridos. No modifica filas existentes.
BEGIN;

-- Impide que cambie el origen durante la validación e incorporación histórica.
LOCK TABLE "modalidades_aplicacion" IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "modalidades_aplicacion" GROUP BY cliente_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Existen aplicaciones duplicadas por cliente; conciliar antes de migrar';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "modalidades_aplicacion" m
    JOIN "diagnostico_especializado" d ON d.id = m.diagnostico_id
    WHERE d.cliente_id <> m.cliente_id
      OR (m.aplica_m10::int + m.aplica_m40::int + m.aplica_m40r::int) NOT BETWEEN 1 AND 2
      OR (m.aplica_m10 AND m.aplica_m40)
      OR m.tipo_modalidad IS DISTINCT FROM
        (CASE WHEN (m.aplica_m10::int + m.aplica_m40::int + m.aplica_m40r::int) = 2 THEN 'mixto'
          WHEN m.aplica_m10 THEN 'modalidad_10' WHEN m.aplica_m40 THEN 'modalidad_40'
          ELSE 'modalidad_40_retroactiva' END)::"tipo_modalidad"
      OR (NOT m.aplica_m10 AND (m.fase_m10_id IS NOT NULL OR m.estatus_m10_id IS NOT NULL))
      OR (NOT m.aplica_m40 AND (m.fase_m40_id IS NOT NULL OR m.estatus_m40_id IS NOT NULL))
      OR (NOT m.aplica_m40r AND (m.fase_m40r_id IS NOT NULL OR m.estatus_m40r_id IS NOT NULL))
  ) THEN RAISE EXCEPTION 'Aplicaciones históricas inconsistentes; no se corrigen automáticamente'; END IF;
END;
$$;

CREATE TABLE "modalidades_seguimiento" (
  "modalidad_aplicacion_id" UUID NOT NULL,
  "modalidad" "tipo_modalidad" NOT NULL,
  "fecha_cita_imss" DATE,
  "ultimo_salario_diario_registrado" DECIMAL(10,2),
  "motivo_cierre" TEXT,
  "creado_el" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizado_el" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "creado_por" UUID,
  "actualizado_por" UUID,
  CONSTRAINT "modalidades_seguimiento_pkey" PRIMARY KEY ("modalidad_aplicacion_id", "modalidad"),
  CONSTRAINT "modalidades_seguimiento_individual_check" CHECK ("modalidad" IN ('modalidad_10', 'modalidad_40', 'modalidad_40_retroactiva')),
  CONSTRAINT "modalidades_seguimiento_modalidad_aplicacion_id_fkey" FOREIGN KEY ("modalidad_aplicacion_id") REFERENCES "modalidades_aplicacion"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "modalidades_seguimiento_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "modalidades_seguimiento_actualizado_por_fkey" FOREIGN KEY ("actualizado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);

-- Condición 3 de la autorización: NO atribuir automáticamente valores compartidos,
-- incluso si existe una sola modalidad. Permanecen intactos y separados en el origen.
-- Solo se crean filas individuales vacías. Las fechas heredadas son del registro
-- original, no prueba de actividad individual; NULL en autor identifica ese origen.
INSERT INTO "modalidades_seguimiento" (
  modalidad_aplicacion_id, modalidad, creado_el, actualizado_el
)
SELECT m.id, v.modalidad::"tipo_modalidad",
  m.creado_el, m.actualizado_el
FROM "modalidades_aplicacion" m
CROSS JOIN LATERAL (VALUES ('modalidad_10', m.aplica_m10), ('modalidad_40', m.aplica_m40), ('modalidad_40_retroactiva', m.aplica_m40r)) v(modalidad, aplica)
WHERE v.aplica;

COMMIT;
-- Reversión preferida: retirar el consumidor y conservar esta tabla.
-- No borrar la tabla ni copiar sus valores sobre campos compartidos sin exportación y autorización.
