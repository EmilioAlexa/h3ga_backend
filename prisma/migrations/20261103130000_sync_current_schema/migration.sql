-- CreateEnum
CREATE TYPE "public"."aplicabilidad_recuperacion" AS ENUM ('si', 'no', 'requiere_mas_evidencia');

-- CreateEnum
CREATE TYPE "public"."base_calculo_dispersion" AS ENUM ('monto_bruto', 'monto_neto');

-- CreateEnum
CREATE TYPE "public"."categoria_tramite" AS ENUM ('no_aplica', 'pendiente', 'en_proceso', 'completado', 'excepcion');

-- CreateEnum
CREATE TYPE "public"."conveniencia_pension" AS ENUM ('si', 'no', 'depende_escenario');

-- CreateEnum
CREATE TYPE "public"."criterio_seleccion_nss" AS ENUM ('vinculo_curp', 'antiguedad', 'credito_infonavit', 'estatus_pension');

-- CreateEnum
CREATE TYPE "public"."cumplimiento_criterio" AS ENUM ('cumple', 'no_cumple', 'requiere_validar');

-- CreateEnum
CREATE TYPE "public"."estado_civil" AS ENUM ('soltero', 'casado', 'divorciado', 'viudo', 'concubinato');

-- CreateEnum
CREATE TYPE "public"."estado_confirmacion" AS ENUM ('si', 'no', 'por_confirmar');

-- CreateEnum
CREATE TYPE "public"."estado_salud" AS ENUM ('bueno', 'regular', 'malo');

-- CreateEnum
CREATE TYPE "public"."estatus_evento_agenda" AS ENUM ('pendiente', 'cumplido', 'reagendado', 'cancelado');

-- CreateEnum
CREATE TYPE "public"."estatus_inconsistencia" AS ENUM ('pendiente', 'en_tramite', 'recuperado', 'no_procedente');

-- CreateEnum
CREATE TYPE "public"."estatus_plan_accion" AS ENUM ('pendiente', 'en_proceso', 'hecho');

-- CreateEnum
CREATE TYPE "public"."etapa_institucional_nss" AS ENUM ('ingreso_validacion', 'dictaminacion_imss', 'migracion_historial', 'notificacion_consar_infonavit');

-- CreateEnum
CREATE TYPE "public"."evaluacion_modalidad" AS ENUM ('aplica', 'no_aplica', 'aplica_con_restricciones', 'requiere_regularizacion', 'temporal', 'evaluar', 'requiere_contabilidad');

-- CreateEnum
CREATE TYPE "public"."evaluacion_retroactivo" AS ENUM ('conviene', 'no_conviene', 'conviene_parcialmente', 'requiere_calculo_validacion');

-- CreateEnum
CREATE TYPE "public"."objetivo_cliente" AS ENUM ('pensionarse_asap', 'mejorar_monto_pension', 'negativa_pension');

-- CreateEnum
CREATE TYPE "public"."sexo_cliente" AS ENUM ('hombre', 'mujer');

-- CreateEnum
CREATE TYPE "public"."si_no_parcial" AS ENUM ('si', 'no', 'parcialmente');

-- CreateEnum
CREATE TYPE "public"."tipo_aviso" AS ENUM ('cita', 'tramite');

-- CreateEnum
CREATE TYPE "public"."tipo_calculo_dispersion" AS ENUM ('porcentaje', 'monto_fijo');

-- CreateEnum
CREATE TYPE "public"."tipo_destino_dispersion" AS ENUM ('usuario', 'externo', 'empresa');

-- CreateEnum
CREATE TYPE "public"."tipo_modalidad" AS ENUM ('modalidad_10', 'modalidad_40', 'modalidad_40_retroactiva', 'mixto');

-- CreateEnum
CREATE TYPE "public"."tipo_pension" AS ENUM ('cesantia', 'vejez', 'invalidez', 'viudez', 'otro');

-- CreateEnum
CREATE TYPE "public"."validacion_estado" AS ENUM ('si', 'no', 'requiere_validar');

-- DropForeignKey
ALTER TABLE "public"."comisiones" DROP CONSTRAINT "fk_comisiones_asesor";

-- DropForeignKey
ALTER TABLE "public"."configuracion_comisiones" DROP CONSTRAINT "fk_config_comision_asesor";

-- DropForeignKey
ALTER TABLE "public"."configuracion_comisiones" DROP CONSTRAINT "fk_config_comision_tipo";

-- DropForeignKey
ALTER TABLE "public"."detalle_prenomina" DROP CONSTRAINT "fk_detalle_prenomina_asesor";

-- AlterTable
ALTER TABLE "public"."comisiones" DROP COLUMN "asesor_id",
DROP COLUMN "porcentaje",
ADD COLUMN     "beneficiario_id" UUID,
ADD COLUMN     "concepto_id" SMALLINT NOT NULL,
ADD COLUMN     "contrato_dispersion_detalle_id" UUID,
ADD COLUMN     "detalle_prenomina_id" UUID,
ADD COLUMN     "tipo_calculo" "public"."tipo_calculo_dispersion" NOT NULL,
ADD COLUMN     "valor_aplicado" DECIMAL(12,2) NOT NULL;

-- AlterTable
ALTER TABLE "public"."detalle_prenomina" DROP COLUMN "asesor_id",
ADD COLUMN     "beneficiario_id" UUID NOT NULL;

-- DropTable
DROP TABLE "public"."configuracion_comisiones";

-- CreateTable
CREATE TABLE "public"."afore" (
    "id" SMALLSERIAL NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "afore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."analisis_modalidad40_retroactivo" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "diagnostico_id" UUID NOT NULL,
    "fecha_propuesta_inicio_m40" DATE,
    "fecha_solicitud" DATE,
    "meses_retroactivos_estimados" SMALLINT,
    "salario_diario_propuesto" DECIMAL(10,2),
    "cuotas_estimadas" DECIMAL(12,2),
    "recargos_actualizaciones_estimadas" DECIMAL(12,2),
    "total_estimado_pagar" DECIMAL(12,2),
    "baja_por_mora_previa" BOOLEAN,
    "dentro_de_plazo_reingreso" "public"."validacion_estado",
    "conclusion_retroactivo" "public"."evaluacion_retroactivo",
    "comentarios" TEXT,

    CONSTRAINT "analisis_modalidad40_retroactivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."analisis_recuperacion_semanas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "diagnostico_id" UUID NOT NULL,
    "aplica" "public"."aplicabilidad_recuperacion",
    "observaciones" TEXT,

    CONSTRAINT "analisis_recuperacion_semanas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."avisos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tipo" "public"."tipo_aviso" NOT NULL,
    "etapa_tramite_id" UUID,
    "evento_id" UUID,
    "fecha_alerta" TIMESTAMPTZ(6) NOT NULL,
    "atendido" BOOLEAN NOT NULL DEFAULT false,
    "atendido_por" UUID,
    "fecha_atencion" TIMESTAMPTZ(6),

    CONSTRAINT "avisos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."cliente_objetivos_especificos" (
    "cliente_id" UUID NOT NULL,
    "objetivo_id" SMALLINT NOT NULL,

    CONSTRAINT "pk_cliente_objetivos_especificos" PRIMARY KEY ("cliente_id","objetivo_id")
);

-- CreateTable
CREATE TABLE "public"."conceptos_dispersion" (
    "id" SMALLSERIAL NOT NULL,
    "nombre" VARCHAR(50) NOT NULL,
    "descripcion" TEXT,
    "tipo_destino" "public"."tipo_destino_dispersion" NOT NULL,
    "incluye_en_prenomina" BOOLEAN NOT NULL DEFAULT false,
    "es_remanente" BOOLEAN NOT NULL DEFAULT false,
    "orden" SMALLINT NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "conceptos_dispersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."configuracion_comisiones_obsoleta" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "asesor_id" UUID NOT NULL,
    "tipo_asesor_id" SMALLINT NOT NULL,
    "porcentaje" DECIMAL(5,2) NOT NULL,
    "vigencia_desde" DATE NOT NULL,
    "vigencia_hasta" DATE,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "configuracion_comisiones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."contrato_dispersion_detalle" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contrato_id" UUID NOT NULL,
    "concepto_id" SMALLINT NOT NULL,
    "beneficiario_id" UUID,
    "tipo_calculo" "public"."tipo_calculo_dispersion" NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "base_calculo" "public"."base_calculo_dispersion" NOT NULL DEFAULT 'monto_bruto',
    "orden" SMALLINT NOT NULL DEFAULT 0,
    "esquema_origen_id" SMALLINT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_por" UUID,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contrato_dispersion_detalle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."correcciones_cliente" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cliente_id" UUID NOT NULL,
    "tipo_correccion_id" SMALLINT NOT NULL,
    "observaciones" TEXT,
    "tiempo_promedio" TEXT,
    "dato_actual" TEXT,
    "dato_correcto" TEXT,

    CONSTRAINT "correcciones_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."credenciales_correo_cliente" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cliente_id" UUID NOT NULL,
    "correo" TEXT NOT NULL,
    "contrasena_encriptada" TEXT NOT NULL,
    "fecha_actualizacion" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_por" UUID,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "credenciales_correo_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."diagnostico_especializado" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cliente_id" UUID NOT NULL,
    "fecha_analisis" DATE DEFAULT CURRENT_DATE,
    "asesor_id" UUID NOT NULL,
    "fecha_primera_cotizacion" DATE,
    "cotizo_antes_julio_1997" BOOLEAN,
    "tipo_pension_probable" "public"."tipo_pension",
    "edad_objetivo_pension" SMALLINT,
    "comentarios_cliente" TEXT,
    "observaciones_regimen" TEXT,
    "fecha_ultima_baja" DATE,
    "ultimo_salario_cotizado" DECIMAL(10,2),
    "fecha_vencimiento_conservacion" DATE,
    "tiene_conservacion_derechos" "public"."validacion_estado",
    "tiempo_estimado_conservacion_meses" INTEGER,
    "dentro_de_conservacion" "public"."validacion_estado",
    "requiere_reactivacion" BOOLEAN DEFAULT false,
    "conviene_pensionar_ahora" "public"."conveniencia_pension",
    "comentarios_conservacion" TEXT,
    "semanas_reconocidas_al_baja" INTEGER,
    "semanas_descontadas" INTEGER DEFAULT 0,
    "semanas_reintegradas" INTEGER DEFAULT 0,
    "semanas_efectivas_pension" INTEGER,
    "semanas_requeridas_pension" INTEGER,
    "trabaja_cuenta_propia" "public"."si_no_parcial",
    "actividad_economica" TEXT,
    "ingreso_mensual_aproximado" DECIMAL(10,2),
    "conclusion_modalidad_10" "public"."evaluacion_modalidad",
    "comentarios_modalidad_10" TEXT,
    "dado_de_baja_regimen_obligatorio" "public"."validacion_estado",
    "conclusion_modalidad_40" "public"."evaluacion_modalidad",
    "salario_propuesto_m40" DECIMAL(10,2),
    "meses_propuestos_m40" SMALLINT,
    "evalua_retroactivo_m40" BOOLEAN DEFAULT false,
    "comentarios_modalidad_40" TEXT,
    "justificacion_estrategia" TEXT,
    "siguiente_paso_sugerido" TEXT,
    "conclusion_financiera" TEXT,
    "firma_cliente_path" TEXT,
    "firma_asesor_path" TEXT,
    "fecha_firma" TIMESTAMPTZ(6),
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diagnostico_especializado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."diagnostico_estrategias_recomendadas" (
    "diagnostico_id" UUID NOT NULL,
    "estrategia_id" SMALLINT NOT NULL,
    "detalle_otro" TEXT,

    CONSTRAINT "pk_diagnostico_estrategias_recomendadas" PRIMARY KEY ("diagnostico_id","estrategia_id")
);

-- CreateTable
CREATE TABLE "public"."diagnostico_inconsistencias_generales" (
    "diagnostico_id" UUID NOT NULL,
    "tipo_id" SMALLINT NOT NULL,
    "detalle_otro" TEXT,

    CONSTRAINT "pk_diagnostico_inconsistencias_generales" PRIMARY KEY ("diagnostico_id","tipo_id")
);

-- CreateTable
CREATE TABLE "public"."diagnostico_objetivos" (
    "diagnostico_id" UUID NOT NULL,
    "objetivo_id" SMALLINT NOT NULL,
    "detalle_otro" TEXT,

    CONSTRAINT "pk_diagnostico_objetivos" PRIMARY KEY ("diagnostico_id","objetivo_id")
);

-- CreateTable
CREATE TABLE "public"."diagnostico_objetivos_m10" (
    "diagnostico_id" UUID NOT NULL,
    "objetivo_id" SMALLINT NOT NULL,
    "detalle_otro" TEXT,

    CONSTRAINT "pk_diagnostico_objetivos_m10" PRIMARY KEY ("diagnostico_id","objetivo_id")
);

-- CreateTable
CREATE TABLE "public"."diagnostico_objetivos_m40" (
    "diagnostico_id" UUID NOT NULL,
    "objetivo_id" SMALLINT NOT NULL,
    "detalle_otro" TEXT,

    CONSTRAINT "pk_diagnostico_objetivos_m40" PRIMARY KEY ("diagnostico_id","objetivo_id")
);

-- CreateTable
CREATE TABLE "public"."divisiones" (
    "id" SMALLSERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "divisiones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."documentos_clientes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cliente_id" UUID NOT NULL,
    "tipo_documento_id" SMALLINT NOT NULL,
    "archivo_path" TEXT NOT NULL,
    "nombre_archivo_original" TEXT,
    "mime_type" TEXT,
    "estatus" "public"."estado_confirmacion",
    "numero_referencia" TEXT,
    "fecha_carga" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subido_por" UUID,
    "observaciones" TEXT,

    CONSTRAINT "documentos_clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."escenario_pension" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "diagnostico_f1_id" UUID NOT NULL,
    "nombre_escenario" TEXT NOT NULL,
    "orden" SMALLINT,
    "semanas_proyectadas" INTEGER,
    "salario_promedio_proyectado" DECIMAL(10,2),
    "inversion_total_estimada" DECIMAL(12,2) DEFAULT 0,
    "pension_mensual_estimada" DECIMAL(12,2),
    "incremento_mensual" DECIMAL(12,2),
    "meses_recuperacion_inversion" DECIMAL(6,1),
    "beneficio_a_5_anios" DECIMAL(12,2),
    "beneficio_a_10_anios" DECIMAL(12,2),
    "beneficio_a_15_anios" DECIMAL(12,2),
    "salario_modalidad_40" DECIMAL(10,2),
    "meses_modalidad_40" SMALLINT,
    "costo_mensual_estimado" DECIMAL(12,2),

    CONSTRAINT "escenario_pension_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."esquemas_dispersion" (
    "id" SMALLSERIAL NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "descripcion" TEXT,
    "servicio_id" SMALLINT NOT NULL,
    "tipo_asesor_id" SMALLINT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_por" UUID,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "esquemas_dispersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."esquemas_dispersion_detalle" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "esquema_id" SMALLINT NOT NULL,
    "concepto_id" SMALLINT NOT NULL,
    "tipo_calculo" "public"."tipo_calculo_dispersion" NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "base_calculo" "public"."base_calculo_dispersion" NOT NULL DEFAULT 'monto_bruto',
    "orden" SMALLINT NOT NULL DEFAULT 0,

    CONSTRAINT "esquemas_dispersion_detalle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."estatus_modalidad" (
    "id" SMALLSERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" SMALLINT NOT NULL,
    "es_final" BOOLEAN NOT NULL,

    CONSTRAINT "estatus_modalidad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."estatus_tramite" (
    "id" SMALLSERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "categoria" "public"."categoria_tramite" NOT NULL,
    "avance_porcentaje_fijo" SMALLINT,
    "avance_editable" BOOLEAN NOT NULL DEFAULT false,
    "avance_min" SMALLINT,
    "avance_max" SMALLINT,

    CONSTRAINT "estatus_tramite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."estrategia_recomendada_tipo" (
    "id" SMALLSERIAL NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "estrategia_recomendada_tipo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."etapas_proceso" (
    "id" SMALLSERIAL NOT NULL,
    "numero_paso" SMALLINT NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "etapas_proceso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."etapas_tramite" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cliente_id" UUID NOT NULL,
    "etapa_id" SMALLINT NOT NULL,
    "estatus_id" SMALLINT NOT NULL,
    "avance_porcentaje" SMALLINT NOT NULL DEFAULT 0,
    "accion_a_realizar" TEXT,
    "fecha_compromiso" DATE,
    "fecha_completada" DATE,
    "reactivado_en" TIMESTAMPTZ(6),
    "creado_el" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_el" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "motivo_rechazo" TEXT,

    CONSTRAINT "etapas_tramite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."etapas_tramite_historial" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "etapa_tramite_id" UUID NOT NULL,
    "estatus_anterior_id" SMALLINT,
    "estatus_nuevo_id" SMALLINT NOT NULL,
    "motivo_rechazo" TEXT,
    "cambiado_por" UUID NOT NULL,
    "fecha_cambio" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "etapas_tramite_historial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."eventos_agenda" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "asesor_id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "hora" TIME(6),
    "motivo" TEXT,
    "estatus" "public"."estatus_evento_agenda",

    CONSTRAINT "eventos_agenda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."grupos_principales" (
    "id" SMALLSERIAL NOT NULL,
    "division_id" SMALLINT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "grupos_principales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."historial_laboral" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cliente_id" UUID NOT NULL,
    "semanas_issste" INTEGER,
    "salario_promedio" DECIMAL(10,2),
    "ultimo_patron" TEXT,
    "vigencia_derechos" "public"."estado_confirmacion",
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "historial_laboral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."informacion_fiscal" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cliente_id" UUID NOT NULL,
    "regimen_fiscal" TEXT,
    "fecha_registro" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "observaciones" TEXT,
    "fiel_entregada" BOOLEAN NOT NULL DEFAULT false,
    "sat_contrasena_entregada" BOOLEAN NOT NULL DEFAULT false,
    "fecha_confirmacion" TIMESTAMPTZ(6),

    CONSTRAINT "informacion_fiscal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."informacion_issste" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "historial_laboral_id" UUID NOT NULL,
    "nss_issste" VARCHAR(20),
    "regimen_pensionario" TEXT,
    "anios_laborados" DECIMAL(5,2),
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "informacion_issste_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ley_probable" (
    "id" SMALLSERIAL NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "ley_probable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."modalidad10_criterios" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "diagnostico_id" UUID NOT NULL,
    "criterio" TEXT NOT NULL,
    "cumple" BOOLEAN,
    "observaciones" TEXT,

    CONSTRAINT "modalidad10_criterios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."modalidad40_criterios" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "diagnostico_id" UUID NOT NULL,
    "criterio" TEXT NOT NULL,
    "cumplimiento" "public"."cumplimiento_criterio",
    "observaciones" TEXT,

    CONSTRAINT "modalidad40_criterios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."modalidades_aplicacion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cliente_id" UUID NOT NULL,
    "diagnostico_id" UUID NOT NULL,
    "estatus_m10_id" SMALLINT,
    "estatus_m40r_id" SMALLINT,
    "estatus_m40_id" SMALLINT,
    "tipo_modalidad" "public"."tipo_modalidad",
    "fecha_cita_imss" DATE,
    "ultimo_salario_diario_registrado" DECIMAL(10,2),
    "creado_el" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "modalidades_aplicacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."objetivo_diagnostico" (
    "id" SMALLSERIAL NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "objetivo_diagnostico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."objetivo_especifico_inicial" (
    "id" SMALLSERIAL NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "objetivo_especifico_inicial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."objetivo_modalidad_10" (
    "id" SMALLSERIAL NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "objetivo_modalidad_10_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."objetivo_modalidad_40" (
    "id" SMALLSERIAL NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "objetivo_modalidad_40_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."periodos_inconsistencias" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cliente_id" UUID NOT NULL,
    "nombre_patron" TEXT,
    "periodo_reclamado" TEXT,
    "semanas_esperadas" INTEGER,
    "semanas_reconocidas" INTEGER DEFAULT 0,
    "evidencia_disponible" TEXT,
    "accion_sugerida" TEXT,
    "estatus" "public"."estatus_inconsistencia" NOT NULL DEFAULT 'pendiente',

    CONSTRAINT "periodos_inconsistencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."plan_accion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "diagnostico_id" UUID NOT NULL,
    "accion" TEXT NOT NULL,
    "fecha_objetivo" DATE,
    "estatus" "public"."estatus_plan_accion",
    "observaciones" TEXT,

    CONSTRAINT "plan_accion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."recuperacion_evidencias" (
    "analisis_id" UUID NOT NULL,
    "tipo_evidencia_id" SMALLINT NOT NULL,
    "detalle_otro" TEXT,

    CONSTRAINT "pk_recuperacion_evidencias" PRIMARY KEY ("analisis_id","tipo_evidencia_id")
);

-- CreateTable
CREATE TABLE "public"."recuperacion_gestiones" (
    "analisis_id" UUID NOT NULL,
    "tipo_gestion_id" SMALLINT NOT NULL,
    "detalle_otro" TEXT,

    CONSTRAINT "pk_recuperacion_gestiones" PRIMARY KEY ("analisis_id","tipo_gestion_id")
);

-- CreateTable
CREATE TABLE "public"."regimen_principal" (
    "id" SMALLSERIAL NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "regimen_principal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."retroactivo_evaluacion_conveniencia" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "retroactivo_id" UUID NOT NULL,
    "pregunta" TEXT NOT NULL,
    "respuesta" BOOLEAN,

    CONSTRAINT "retroactivo_evaluacion_conveniencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."situacion_patrimonial" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "diagnostico_f1_id" UUID NOT NULL,
    "saldo_cuenta_individual" DECIMAL(12,2),
    "aportaciones_voluntarias" DECIMAL(12,2),
    "ahorros_inversiones_adicionales" DECIMAL(12,2),
    "bienes_patrimoniales" TEXT,
    "creditos_deudas_vigentes" TEXT,
    "ingreso_mensual" DECIMAL(12,2),
    "otras_fuentes_ingreso" TEXT,
    "ingreso_conyuge" DECIMAL(12,2),
    "seguros" TEXT,
    "estado_salud" "public"."estado_salud",
    "padecimientos" TEXT,
    "estado_civil" "public"."estado_civil",
    "edad_conyuge" SMALLINT,
    "actividad_economica_conyuge" TEXT,

    CONSTRAINT "situacion_patrimonial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."situacion_patrimonial_hijos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "situacion_patrimonial_id" UUID NOT NULL,
    "numero_hijos" SMALLINT DEFAULT 0,
    "tiene_discapacidad" BOOLEAN DEFAULT false,
    "edad" SMALLINT,

    CONSTRAINT "situacion_patrimonial_hijos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tipo_correccion" (
    "id" SMALLSERIAL NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "tipo_correccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tipo_documento" (
    "id" SMALLSERIAL NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "tipo_documento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tipo_evidencia_recuperacion" (
    "id" SMALLSERIAL NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "tipo_evidencia_recuperacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tipo_gestion_recuperacion" (
    "id" SMALLSERIAL NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "tipo_gestion_recuperacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tipo_inconsistencia_detectada" (
    "id" SMALLSERIAL NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "tipo_inconsistencia_detectada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."unificacion_nss_detalle" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "correccion_id" UUID NOT NULL,
    "nss_principal_elegido" VARCHAR(11),
    "criterio_seleccion" "public"."criterio_seleccion_nss",
    "etapa_institucional_actual" "public"."etapa_institucional_nss",

    CONSTRAINT "unificacion_nss_detalle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."unificacion_nss_secundarios" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "unificacion_id" UUID NOT NULL,
    "nss" VARCHAR(11),
    "observaciones" TEXT,

    CONSTRAINT "unificacion_nss_secundarios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "analisis_modalidad40_retroactivo_diagnostico_id_key" ON "public"."analisis_modalidad40_retroactivo"("diagnostico_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "analisis_recuperacion_semanas_diagnostico_id_key" ON "public"."analisis_recuperacion_semanas"("diagnostico_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "conceptos_dispersion_nombre_key" ON "public"."conceptos_dispersion"("nombre" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "uq_concepto_remanente" ON "public"."conceptos_dispersion"("es_remanente" ASC) WHERE es_remanente;

-- CreateIndex
CREATE INDEX "ix_cdd_beneficiario" ON "public"."contrato_dispersion_detalle"("beneficiario_id" ASC);

-- CreateIndex
CREATE INDEX "ix_cdd_contrato" ON "public"."contrato_dispersion_detalle"("contrato_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "uq_contrato_concepto" ON "public"."contrato_dispersion_detalle"("contrato_id" ASC, "concepto_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "credenciales_correo_cliente_cliente_id_key" ON "public"."credenciales_correo_cliente"("cliente_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "diagnostico_especializado_cliente_id_key" ON "public"."diagnostico_especializado"("cliente_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "divisiones_nombre_key" ON "public"."divisiones"("nombre" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "esquemas_dispersion_nombre_key" ON "public"."esquemas_dispersion"("nombre" ASC);

-- CreateIndex
CREATE INDEX "ix_esquemas_servicio" ON "public"."esquemas_dispersion"("servicio_id" ASC);

-- CreateIndex
CREATE INDEX "ix_esquemas_tipo_asesor" ON "public"."esquemas_dispersion"("tipo_asesor_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "uq_esquema_concepto" ON "public"."esquemas_dispersion_detalle"("esquema_id" ASC, "concepto_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "estatus_modalidad_nombre_key" ON "public"."estatus_modalidad"("nombre" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "estrategia_recomendada_tipo_nombre_key" ON "public"."estrategia_recomendada_tipo"("nombre" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "etapas_proceso_numero_paso_key" ON "public"."etapas_proceso"("numero_paso" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "uq_etapas_tramite_cliente_etapa" ON "public"."etapas_tramite"("cliente_id" ASC, "etapa_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "uq_grupos_principales_division_nombre" ON "public"."grupos_principales"("division_id" ASC, "nombre" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "historial_laboral_cliente_id_key" ON "public"."historial_laboral"("cliente_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "informacion_fiscal_cliente_id_key" ON "public"."informacion_fiscal"("cliente_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "informacion_issste_historial_laboral_id_key" ON "public"."informacion_issste"("historial_laboral_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "objetivo_diagnostico_nombre_key" ON "public"."objetivo_diagnostico"("nombre" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "objetivo_especifico_inicial_nombre_key" ON "public"."objetivo_especifico_inicial"("nombre" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "objetivo_modalidad_10_nombre_key" ON "public"."objetivo_modalidad_10"("nombre" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "objetivo_modalidad_40_nombre_key" ON "public"."objetivo_modalidad_40"("nombre" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "situacion_patrimonial_diagnostico_f1_id_key" ON "public"."situacion_patrimonial"("diagnostico_f1_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "tipo_documento_nombre_key" ON "public"."tipo_documento"("nombre" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "tipo_evidencia_recuperacion_nombre_key" ON "public"."tipo_evidencia_recuperacion"("nombre" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "tipo_gestion_recuperacion_nombre_key" ON "public"."tipo_gestion_recuperacion"("nombre" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "tipo_inconsistencia_detectada_nombre_key" ON "public"."tipo_inconsistencia_detectada"("nombre" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "unificacion_nss_detalle_correccion_id_key" ON "public"."unificacion_nss_detalle"("correccion_id" ASC);

-- CreateIndex
CREATE INDEX "ix_comisiones_beneficiario" ON "public"."comisiones"("beneficiario_id" ASC);

-- CreateIndex
CREATE INDEX "ix_comisiones_concepto" ON "public"."comisiones"("concepto_id" ASC);

-- CreateIndex
CREATE INDEX "ix_comisiones_prenomina" ON "public"."comisiones"("detalle_prenomina_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "uq_comisiones_pago_concepto" ON "public"."comisiones"("pago_id" ASC, "concepto_id" ASC);

-- AddForeignKey
ALTER TABLE "public"."analisis_modalidad40_retroactivo" ADD CONSTRAINT "fk_analisis_m40_retro_diagnostico" FOREIGN KEY ("diagnostico_id") REFERENCES "public"."diagnostico_especializado"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."analisis_recuperacion_semanas" ADD CONSTRAINT "fk_analisis_recuperacion_diagnostico" FOREIGN KEY ("diagnostico_id") REFERENCES "public"."diagnostico_especializado"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."avisos" ADD CONSTRAINT "fk_avisos_atendido_por" FOREIGN KEY ("atendido_por") REFERENCES "public"."usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."avisos" ADD CONSTRAINT "fk_avisos_etapa_tramite" FOREIGN KEY ("etapa_tramite_id") REFERENCES "public"."etapas_tramite"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."avisos" ADD CONSTRAINT "fk_avisos_evento" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos_agenda"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."cliente_objetivos_especificos" ADD CONSTRAINT "fk_cliente_objetivos_cliente" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."cliente_objetivos_especificos" ADD CONSTRAINT "fk_cliente_objetivos_objetivo" FOREIGN KEY ("objetivo_id") REFERENCES "public"."objetivo_especifico_inicial"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."clientes" ADD CONSTRAINT "fk_clientes_afore" FOREIGN KEY ("afore_id") REFERENCES "public"."afore"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."clientes" ADD CONSTRAINT "fk_clientes_grupo_principal" FOREIGN KEY ("grupo_principal_id") REFERENCES "public"."grupos_principales"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."clientes" ADD CONSTRAINT "fk_clientes_ley_probable" FOREIGN KEY ("ley_probable_id") REFERENCES "public"."ley_probable"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."clientes" ADD CONSTRAINT "fk_clientes_regimen" FOREIGN KEY ("regimen_id") REFERENCES "public"."regimen_principal"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."comisiones" ADD CONSTRAINT "comisiones_concepto_id_fkey" FOREIGN KEY ("concepto_id") REFERENCES "public"."conceptos_dispersion"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."comisiones" ADD CONSTRAINT "comisiones_contrato_dispersion_detalle_id_fkey" FOREIGN KEY ("contrato_dispersion_detalle_id") REFERENCES "public"."contrato_dispersion_detalle"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."comisiones" ADD CONSTRAINT "comisiones_detalle_prenomina_id_fkey" FOREIGN KEY ("detalle_prenomina_id") REFERENCES "public"."detalle_prenomina"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."comisiones" ADD CONSTRAINT "fk_comisiones_asesor" FOREIGN KEY ("beneficiario_id") REFERENCES "public"."usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."configuracion_comisiones_obsoleta" ADD CONSTRAINT "fk_config_comision_asesor" FOREIGN KEY ("asesor_id") REFERENCES "public"."usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."configuracion_comisiones_obsoleta" ADD CONSTRAINT "fk_config_comision_tipo" FOREIGN KEY ("tipo_asesor_id") REFERENCES "public"."tipos_asesor"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."contrato_dispersion_detalle" ADD CONSTRAINT "contrato_dispersion_detalle_beneficiario_id_fkey" FOREIGN KEY ("beneficiario_id") REFERENCES "public"."usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."contrato_dispersion_detalle" ADD CONSTRAINT "contrato_dispersion_detalle_concepto_id_fkey" FOREIGN KEY ("concepto_id") REFERENCES "public"."conceptos_dispersion"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."contrato_dispersion_detalle" ADD CONSTRAINT "contrato_dispersion_detalle_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "public"."contratos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."contrato_dispersion_detalle" ADD CONSTRAINT "contrato_dispersion_detalle_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."contrato_dispersion_detalle" ADD CONSTRAINT "contrato_dispersion_detalle_esquema_origen_id_fkey" FOREIGN KEY ("esquema_origen_id") REFERENCES "public"."esquemas_dispersion"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."correcciones_cliente" ADD CONSTRAINT "fk_correcciones_cliente_cliente" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."correcciones_cliente" ADD CONSTRAINT "fk_correcciones_cliente_tipo" FOREIGN KEY ("tipo_correccion_id") REFERENCES "public"."tipo_correccion"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."credenciales_correo_cliente" ADD CONSTRAINT "fk_credenciales_correo_cliente" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."credenciales_correo_cliente" ADD CONSTRAINT "fk_credenciales_correo_usuario" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."detalle_prenomina" ADD CONSTRAINT "fk_detalle_prenomina_asesor" FOREIGN KEY ("beneficiario_id") REFERENCES "public"."usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."diagnostico_especializado" ADD CONSTRAINT "fk_diagnostico_asesor" FOREIGN KEY ("asesor_id") REFERENCES "public"."usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."diagnostico_especializado" ADD CONSTRAINT "fk_diagnostico_cliente" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."diagnostico_estrategias_recomendadas" ADD CONSTRAINT "fk_diag_estrategias_diagnostico" FOREIGN KEY ("diagnostico_id") REFERENCES "public"."diagnostico_especializado"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."diagnostico_estrategias_recomendadas" ADD CONSTRAINT "fk_diag_estrategias_estrategia" FOREIGN KEY ("estrategia_id") REFERENCES "public"."estrategia_recomendada_tipo"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."diagnostico_inconsistencias_generales" ADD CONSTRAINT "fk_diag_inconsistencias_diagnostico" FOREIGN KEY ("diagnostico_id") REFERENCES "public"."diagnostico_especializado"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."diagnostico_inconsistencias_generales" ADD CONSTRAINT "fk_diag_inconsistencias_tipo" FOREIGN KEY ("tipo_id") REFERENCES "public"."tipo_inconsistencia_detectada"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."diagnostico_objetivos" ADD CONSTRAINT "fk_diag_objetivos_diagnostico" FOREIGN KEY ("diagnostico_id") REFERENCES "public"."diagnostico_especializado"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."diagnostico_objetivos" ADD CONSTRAINT "fk_diag_objetivos_objetivo" FOREIGN KEY ("objetivo_id") REFERENCES "public"."objetivo_diagnostico"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."diagnostico_objetivos_m10" ADD CONSTRAINT "fk_diag_objetivos_m10_diagnostico" FOREIGN KEY ("diagnostico_id") REFERENCES "public"."diagnostico_especializado"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."diagnostico_objetivos_m10" ADD CONSTRAINT "fk_diag_objetivos_m10_objetivo" FOREIGN KEY ("objetivo_id") REFERENCES "public"."objetivo_modalidad_10"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."diagnostico_objetivos_m40" ADD CONSTRAINT "fk_diag_objetivos_m40_diagnostico" FOREIGN KEY ("diagnostico_id") REFERENCES "public"."diagnostico_especializado"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."diagnostico_objetivos_m40" ADD CONSTRAINT "fk_diag_objetivos_m40_objetivo" FOREIGN KEY ("objetivo_id") REFERENCES "public"."objetivo_modalidad_40"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."documentos_clientes" ADD CONSTRAINT "fk_documentos_clientes_cliente" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."documentos_clientes" ADD CONSTRAINT "fk_documentos_clientes_tipo" FOREIGN KEY ("tipo_documento_id") REFERENCES "public"."tipo_documento"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."documentos_clientes" ADD CONSTRAINT "fk_documentos_clientes_usuario" FOREIGN KEY ("subido_por") REFERENCES "public"."usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."escenario_pension" ADD CONSTRAINT "fk_escenario_pension_diagnostico" FOREIGN KEY ("diagnostico_f1_id") REFERENCES "public"."diagnostico_especializado"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."esquemas_dispersion" ADD CONSTRAINT "esquemas_dispersion_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."esquemas_dispersion" ADD CONSTRAINT "esquemas_dispersion_servicio_id_fkey" FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."esquemas_dispersion" ADD CONSTRAINT "esquemas_dispersion_tipo_asesor_id_fkey" FOREIGN KEY ("tipo_asesor_id") REFERENCES "public"."tipos_asesor"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."esquemas_dispersion_detalle" ADD CONSTRAINT "esquemas_dispersion_detalle_concepto_id_fkey" FOREIGN KEY ("concepto_id") REFERENCES "public"."conceptos_dispersion"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."esquemas_dispersion_detalle" ADD CONSTRAINT "esquemas_dispersion_detalle_esquema_id_fkey" FOREIGN KEY ("esquema_id") REFERENCES "public"."esquemas_dispersion"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."etapas_tramite" ADD CONSTRAINT "fk_etapas_tramite_cliente" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."etapas_tramite" ADD CONSTRAINT "fk_etapas_tramite_estatus" FOREIGN KEY ("estatus_id") REFERENCES "public"."estatus_tramite"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."etapas_tramite" ADD CONSTRAINT "fk_etapas_tramite_etapa" FOREIGN KEY ("etapa_id") REFERENCES "public"."etapas_proceso"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."etapas_tramite_historial" ADD CONSTRAINT "fk_etapas_historial_estatus_anterior" FOREIGN KEY ("estatus_anterior_id") REFERENCES "public"."estatus_tramite"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."etapas_tramite_historial" ADD CONSTRAINT "fk_etapas_historial_estatus_nuevo" FOREIGN KEY ("estatus_nuevo_id") REFERENCES "public"."estatus_tramite"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."etapas_tramite_historial" ADD CONSTRAINT "fk_etapas_historial_etapa_tramite" FOREIGN KEY ("etapa_tramite_id") REFERENCES "public"."etapas_tramite"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."etapas_tramite_historial" ADD CONSTRAINT "fk_etapas_historial_usuario" FOREIGN KEY ("cambiado_por") REFERENCES "public"."usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."eventos_agenda" ADD CONSTRAINT "fk_eventos_agenda_asesor" FOREIGN KEY ("asesor_id") REFERENCES "public"."usuarios"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."eventos_agenda" ADD CONSTRAINT "fk_eventos_agenda_cliente" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."grupos_principales" ADD CONSTRAINT "fk_grupos_principales_division" FOREIGN KEY ("division_id") REFERENCES "public"."divisiones"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."historial_laboral" ADD CONSTRAINT "fk_historial_laboral_cliente" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."informacion_fiscal" ADD CONSTRAINT "fk_informacion_fiscal_cliente" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."informacion_issste" ADD CONSTRAINT "fk_informacion_issste_historial" FOREIGN KEY ("historial_laboral_id") REFERENCES "public"."historial_laboral"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."modalidad10_criterios" ADD CONSTRAINT "fk_modalidad10_criterios_diagnostico" FOREIGN KEY ("diagnostico_id") REFERENCES "public"."diagnostico_especializado"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."modalidad40_criterios" ADD CONSTRAINT "fk_modalidad40_criterios_diagnostico" FOREIGN KEY ("diagnostico_id") REFERENCES "public"."diagnostico_especializado"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."modalidades_aplicacion" ADD CONSTRAINT "fk_modalidades_aplicacion_cliente" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."modalidades_aplicacion" ADD CONSTRAINT "fk_modalidades_aplicacion_diagnostico" FOREIGN KEY ("diagnostico_id") REFERENCES "public"."diagnostico_especializado"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."modalidades_aplicacion" ADD CONSTRAINT "fk_modalidades_aplicacion_estatus_m10" FOREIGN KEY ("estatus_m10_id") REFERENCES "public"."estatus_modalidad"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."modalidades_aplicacion" ADD CONSTRAINT "fk_modalidades_aplicacion_estatus_m40" FOREIGN KEY ("estatus_m40_id") REFERENCES "public"."estatus_modalidad"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."modalidades_aplicacion" ADD CONSTRAINT "fk_modalidades_aplicacion_estatus_m40r" FOREIGN KEY ("estatus_m40r_id") REFERENCES "public"."estatus_modalidad"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."periodos_inconsistencias" ADD CONSTRAINT "fk_periodos_inconsistencias_cliente" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."plan_accion" ADD CONSTRAINT "fk_plan_accion_diagnostico" FOREIGN KEY ("diagnostico_id") REFERENCES "public"."diagnostico_especializado"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."recuperacion_evidencias" ADD CONSTRAINT "fk_recuperacion_evidencias_analisis" FOREIGN KEY ("analisis_id") REFERENCES "public"."analisis_recuperacion_semanas"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."recuperacion_evidencias" ADD CONSTRAINT "fk_recuperacion_evidencias_tipo" FOREIGN KEY ("tipo_evidencia_id") REFERENCES "public"."tipo_evidencia_recuperacion"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."recuperacion_gestiones" ADD CONSTRAINT "fk_recuperacion_gestiones_analisis" FOREIGN KEY ("analisis_id") REFERENCES "public"."analisis_recuperacion_semanas"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."recuperacion_gestiones" ADD CONSTRAINT "fk_recuperacion_gestiones_tipo" FOREIGN KEY ("tipo_gestion_id") REFERENCES "public"."tipo_gestion_recuperacion"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."retroactivo_evaluacion_conveniencia" ADD CONSTRAINT "fk_retroactivo_evaluacion_retroactivo" FOREIGN KEY ("retroactivo_id") REFERENCES "public"."analisis_modalidad40_retroactivo"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."situacion_patrimonial" ADD CONSTRAINT "fk_situacion_patrimonial_diagnostico" FOREIGN KEY ("diagnostico_f1_id") REFERENCES "public"."diagnostico_especializado"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."situacion_patrimonial_hijos" ADD CONSTRAINT "fk_situacion_patrimonial_hijos_situacion" FOREIGN KEY ("situacion_patrimonial_id") REFERENCES "public"."situacion_patrimonial"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."unificacion_nss_detalle" ADD CONSTRAINT "fk_unificacion_nss_detalle_correccion" FOREIGN KEY ("correccion_id") REFERENCES "public"."correcciones_cliente"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."unificacion_nss_secundarios" ADD CONSTRAINT "fk_unificacion_nss_secundarios_detalle" FOREIGN KEY ("unificacion_id") REFERENCES "public"."unificacion_nss_detalle"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
