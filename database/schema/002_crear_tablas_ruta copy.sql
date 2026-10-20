-- ============================================================
-- H3GA RUTA
-- SCRIPT 1: Tipos ENUM + tablas faltantes (SIN llaves foráneas)
-- PostgreSQL
--
-- Requiere que ya existan: roles, usuarios, clientes (compartidas)
-- Las llaves foráneas se agregan en 02_relaciones_ruta.sql
-- ============================================================


-- ############################################################
-- A. TIPOS PERSONALIZADOS (ENUM)
-- ############################################################
-- Nota: el ENUM "estatus_tramite" del diccionario NO se crea porque
-- choca con el nombre de la tabla estatus_tramite (en PostgreSQL una
-- tabla y un tipo no pueden llamarse igual) y ninguna columna lo usa.

CREATE TYPE estado_confirmacion AS ENUM ('si', 'no', 'por_confirmar');

CREATE TYPE estado_civil AS ENUM ('soltero', 'casado', 'divorciado', 'viudo', 'concubinato');

CREATE TYPE categoria_tramite AS ENUM ('no_aplica', 'pendiente', 'en_proceso', 'completado', 'excepcion');

-- Para uso futuro en clientes (hoy esas columnas son TEXT)
CREATE TYPE sexo_cliente AS ENUM ('hombre', 'mujer');

CREATE TYPE objetivo_cliente AS ENUM ('pensionarse_asap', 'mejorar_monto_pension', 'negativa_pension');

CREATE TYPE tipo_pension AS ENUM ('cesantia', 'vejez', 'invalidez', 'viudez', 'otro');

CREATE TYPE evaluacion_modalidad AS ENUM (
    'aplica', 'no_aplica', 'aplica_con_restricciones', 'requiere_regularizacion',
    'temporal', 'evaluar', 'requiere_contabilidad'
);

CREATE TYPE estatus_inconsistencia AS ENUM ('pendiente', 'en_tramite', 'recuperado', 'no_procedente');

CREATE TYPE validacion_estado AS ENUM ('si', 'no', 'requiere_validar');

CREATE TYPE conveniencia_pension AS ENUM ('si', 'no', 'depende_escenario');

CREATE TYPE si_no_parcial AS ENUM ('si', 'no', 'parcialmente');

CREATE TYPE aplicabilidad_recuperacion AS ENUM ('si', 'no', 'requiere_mas_evidencia');

CREATE TYPE cumplimiento_criterio AS ENUM ('cumple', 'no_cumple', 'requiere_validar');

CREATE TYPE evaluacion_retroactivo AS ENUM (
    'conviene', 'no_conviene', 'conviene_parcialmente', 'requiere_calculo_validacion'
);

CREATE TYPE estatus_plan_accion AS ENUM ('pendiente', 'en_proceso', 'hecho');

CREATE TYPE criterio_seleccion_nss AS ENUM ('vinculo_curp', 'antiguedad', 'credito_infonavit', 'estatus_pension');

CREATE TYPE etapa_institucional_nss AS ENUM (
    'ingreso_validacion', 'dictaminacion_imss', 'migracion_historial', 'notificacion_consar_infonavit'
);

CREATE TYPE tipo_aviso AS ENUM ('cita', 'tramite');

CREATE TYPE estatus_evento_agenda AS ENUM ('pendiente', 'cumplido', 'reagendado', 'cancelado');

CREATE TYPE estado_salud AS ENUM ('bueno', 'regular', 'malo');

CREATE TYPE tipo_modalidad AS ENUM ('modalidad_10', 'modalidad_40', 'modalidad_40_retroactiva', 'mixto');


-- ############################################################
-- B. CATÁLOGOS GENERALES
-- ############################################################

CREATE TABLE regimen_principal (
    id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre TEXT NOT NULL
);


CREATE TABLE ley_probable (
    id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre TEXT NOT NULL
);


CREATE TABLE afore (
    id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre TEXT NOT NULL
);


CREATE TABLE tipo_documento (
    id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE
);


CREATE TABLE divisiones (
    id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE,
    activo BOOLEAN NOT NULL DEFAULT TRUE
);


CREATE TABLE grupos_principales (
    id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    division_id SMALLINT NOT NULL,
    nombre TEXT NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,

    CONSTRAINT uq_grupos_principales_division_nombre
        UNIQUE (division_id, nombre)
);


-- ############################################################
-- C. SEGUIMIENTO DE ETAPAS DEL TRÁMITE
-- ############################################################

CREATE TABLE etapas_proceso (
    id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    numero_paso SMALLINT NOT NULL UNIQUE,
    nombre TEXT NOT NULL
);


CREATE TABLE estatus_tramite (
    id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    categoria categoria_tramite NOT NULL,
    avance_porcentaje_fijo SMALLINT,
    avance_editable BOOLEAN NOT NULL DEFAULT FALSE,
    avance_min SMALLINT,
    avance_max SMALLINT
);


CREATE TABLE etapas_tramite (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    cliente_id UUID NOT NULL,
    etapa_id SMALLINT NOT NULL,
    estatus_id SMALLINT NOT NULL,

    avance_porcentaje SMALLINT NOT NULL DEFAULT 0,

    accion_a_realizar TEXT,
    fecha_compromiso DATE,
    fecha_completada DATE,
    reactivado_en TIMESTAMPTZ,

    creado_el TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_el TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    motivo_rechazo TEXT,

    CONSTRAINT uq_etapas_tramite_cliente_etapa
        UNIQUE (cliente_id, etapa_id)
);


CREATE TABLE etapas_tramite_historial (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    etapa_tramite_id UUID NOT NULL,

    estatus_anterior_id SMALLINT,
    estatus_nuevo_id SMALLINT NOT NULL,

    motivo_rechazo TEXT,

    cambiado_por UUID NOT NULL,

    fecha_cambio TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- ############################################################
-- D. DOCUMENTOS DEL CLIENTE
-- ############################################################

CREATE TABLE documentos_clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    cliente_id UUID NOT NULL,
    tipo_documento_id SMALLINT NOT NULL,

    archivo_path TEXT NOT NULL,
    nombre_archivo_original TEXT,
    mime_type TEXT,

    estatus estado_confirmacion,

    numero_referencia TEXT,

    fecha_carga TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    subido_por UUID,

    observaciones TEXT
);


-- ############################################################
-- E. ETAPA 0 - DIAGNÓSTICO INICIAL
-- ############################################################

CREATE TABLE historial_laboral (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    cliente_id UUID NOT NULL UNIQUE,

    semanas_issste INTEGER,
    salario_promedio NUMERIC(10,2),
    ultimo_patron TEXT,
    vigencia_derechos estado_confirmacion,

    activo BOOLEAN NOT NULL DEFAULT TRUE
);


CREATE TABLE informacion_issste (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    historial_laboral_id UUID NOT NULL UNIQUE,

    nss_issste VARCHAR(20),
    regimen_pensionario TEXT,
    anios_laborados NUMERIC(5,2),

    activo BOOLEAN NOT NULL DEFAULT TRUE
);


CREATE TABLE tipo_correccion (
    id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre TEXT NOT NULL
);


CREATE TABLE correcciones_cliente (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    cliente_id UUID NOT NULL,
    tipo_correccion_id SMALLINT NOT NULL,

    observaciones TEXT,
    tiempo_promedio TEXT,
    dato_actual TEXT,
    dato_correcto TEXT
);


CREATE TABLE unificacion_nss_detalle (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    correccion_id UUID NOT NULL UNIQUE,

    nss_principal_elegido VARCHAR(11),
    criterio_seleccion criterio_seleccion_nss,
    etapa_institucional_actual etapa_institucional_nss
);


CREATE TABLE unificacion_nss_secundarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    unificacion_id UUID NOT NULL,

    nss VARCHAR(11),
    observaciones TEXT
);


CREATE TABLE objetivo_especifico_inicial (
    id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE
);


CREATE TABLE cliente_objetivos_especificos (
    cliente_id UUID NOT NULL,
    objetivo_id SMALLINT NOT NULL,

    CONSTRAINT pk_cliente_objetivos_especificos
        PRIMARY KEY (cliente_id, objetivo_id)
);


-- ############################################################
-- F. ETAPA 1 - DIAGNÓSTICO ESPECIALIZADO
-- ############################################################

CREATE TABLE diagnostico_especializado (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    cliente_id UUID NOT NULL UNIQUE,

    fecha_analisis DATE DEFAULT CURRENT_DATE,

    asesor_id UUID NOT NULL,

    fecha_primera_cotizacion DATE,
    cotizo_antes_julio_1997 BOOLEAN,

    tipo_pension_probable tipo_pension,
    edad_objetivo_pension SMALLINT,

    comentarios_cliente TEXT,
    observaciones_regimen TEXT,

    fecha_ultima_baja DATE,
    ultimo_salario_cotizado NUMERIC(10,2),

    fecha_vencimiento_conservacion DATE,
    tiene_conservacion_derechos validacion_estado,
    tiempo_estimado_conservacion_meses INTEGER,
    dentro_de_conservacion validacion_estado,
    requiere_reactivacion BOOLEAN DEFAULT FALSE,
    conviene_pensionar_ahora conveniencia_pension,
    comentarios_conservacion TEXT,

    semanas_reconocidas_al_baja INTEGER,
    semanas_descontadas INTEGER DEFAULT 0,
    semanas_reintegradas INTEGER DEFAULT 0,
    semanas_efectivas_pension INTEGER,
    semanas_requeridas_pension INTEGER,

    trabaja_cuenta_propia si_no_parcial,
    actividad_economica TEXT,
    ingreso_mensual_aproximado NUMERIC(10,2),

    conclusion_modalidad_10 evaluacion_modalidad,
    comentarios_modalidad_10 TEXT,

    dado_de_baja_regimen_obligatorio validacion_estado,
    conclusion_modalidad_40 evaluacion_modalidad,
    salario_propuesto_m40 NUMERIC(10,2),
    meses_propuestos_m40 SMALLINT,
    evalua_retroactivo_m40 BOOLEAN DEFAULT FALSE,
    comentarios_modalidad_40 TEXT,

    justificacion_estrategia TEXT,
    siguiente_paso_sugerido TEXT,
    conclusion_financiera TEXT,

    firma_cliente_path TEXT,
    firma_asesor_path TEXT,
    fecha_firma TIMESTAMPTZ,

    creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- ------------------------------------------------------------
-- Estrategias recomendadas
-- ------------------------------------------------------------
CREATE TABLE estrategia_recomendada_tipo (
    id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE
);


CREATE TABLE diagnostico_estrategias_recomendadas (
    diagnostico_id UUID NOT NULL,
    estrategia_id SMALLINT NOT NULL,
    detalle_otro TEXT,

    CONSTRAINT pk_diagnostico_estrategias_recomendadas
        PRIMARY KEY (diagnostico_id, estrategia_id)
);


-- ------------------------------------------------------------
-- Objetivos del diagnóstico
-- ------------------------------------------------------------
CREATE TABLE objetivo_diagnostico (
    id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE
);


CREATE TABLE diagnostico_objetivos (
    diagnostico_id UUID NOT NULL,
    objetivo_id SMALLINT NOT NULL,
    detalle_otro TEXT,

    CONSTRAINT pk_diagnostico_objetivos
        PRIMARY KEY (diagnostico_id, objetivo_id)
);


-- ------------------------------------------------------------
-- Inconsistencias generales
-- ------------------------------------------------------------
CREATE TABLE tipo_inconsistencia_detectada (
    id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE
);


CREATE TABLE diagnostico_inconsistencias_generales (
    diagnostico_id UUID NOT NULL,
    tipo_id SMALLINT NOT NULL,
    detalle_otro TEXT,

    CONSTRAINT pk_diagnostico_inconsistencias_generales
        PRIMARY KEY (diagnostico_id, tipo_id)
);


CREATE TABLE periodos_inconsistencias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    cliente_id UUID NOT NULL,

    nombre_patron TEXT,
    periodo_reclamado TEXT,
    semanas_esperadas INTEGER,
    semanas_reconocidas INTEGER DEFAULT 0,
    evidencia_disponible TEXT,
    accion_sugerida TEXT,

    estatus estatus_inconsistencia NOT NULL DEFAULT 'pendiente'
);


-- ------------------------------------------------------------
-- Recuperación de semanas
-- ------------------------------------------------------------
CREATE TABLE analisis_recuperacion_semanas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    diagnostico_id UUID NOT NULL UNIQUE,

    aplica aplicabilidad_recuperacion,
    observaciones TEXT
);


CREATE TABLE tipo_gestion_recuperacion (
    id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE
);


CREATE TABLE recuperacion_gestiones (
    analisis_id UUID NOT NULL,
    tipo_gestion_id SMALLINT NOT NULL,
    detalle_otro TEXT,

    CONSTRAINT pk_recuperacion_gestiones
        PRIMARY KEY (analisis_id, tipo_gestion_id)
);


CREATE TABLE tipo_evidencia_recuperacion (
    id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE
);


CREATE TABLE recuperacion_evidencias (
    analisis_id UUID NOT NULL,
    tipo_evidencia_id SMALLINT NOT NULL,
    detalle_otro TEXT,

    CONSTRAINT pk_recuperacion_evidencias
        PRIMARY KEY (analisis_id, tipo_evidencia_id)
);


-- ------------------------------------------------------------
-- Modalidad 10 (diagnóstico)
-- ------------------------------------------------------------
CREATE TABLE objetivo_modalidad_10 (
    id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE
);


CREATE TABLE diagnostico_objetivos_m10 (
    diagnostico_id UUID NOT NULL,
    objetivo_id SMALLINT NOT NULL,
    detalle_otro TEXT,

    CONSTRAINT pk_diagnostico_objetivos_m10
        PRIMARY KEY (diagnostico_id, objetivo_id)
);


CREATE TABLE modalidad10_criterios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    diagnostico_id UUID NOT NULL,

    criterio TEXT NOT NULL,
    cumple BOOLEAN,
    observaciones TEXT
);


-- ------------------------------------------------------------
-- Modalidad 40 (diagnóstico)
-- ------------------------------------------------------------
CREATE TABLE objetivo_modalidad_40 (
    id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE
);


CREATE TABLE diagnostico_objetivos_m40 (
    diagnostico_id UUID NOT NULL,
    objetivo_id SMALLINT NOT NULL,
    detalle_otro TEXT,

    CONSTRAINT pk_diagnostico_objetivos_m40
        PRIMARY KEY (diagnostico_id, objetivo_id)
);


CREATE TABLE modalidad40_criterios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    diagnostico_id UUID NOT NULL,

    criterio TEXT NOT NULL,
    cumplimiento cumplimiento_criterio,
    observaciones TEXT
);


-- ------------------------------------------------------------
-- Modalidad 40 retroactiva (diagnóstico)
-- ------------------------------------------------------------
CREATE TABLE analisis_modalidad40_retroactivo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    diagnostico_id UUID NOT NULL UNIQUE,

    fecha_propuesta_inicio_m40 DATE,
    fecha_solicitud DATE,
    meses_retroactivos_estimados SMALLINT,
    salario_diario_propuesto NUMERIC(10,2),
    cuotas_estimadas NUMERIC(12,2),
    recargos_actualizaciones_estimadas NUMERIC(12,2),
    total_estimado_pagar NUMERIC(12,2),

    baja_por_mora_previa BOOLEAN,
    dentro_de_plazo_reingreso validacion_estado,

    conclusion_retroactivo evaluacion_retroactivo,
    comentarios TEXT
);


CREATE TABLE retroactivo_evaluacion_conveniencia (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    retroactivo_id UUID NOT NULL,

    pregunta TEXT NOT NULL,
    respuesta BOOLEAN
);


-- ------------------------------------------------------------
-- Escenarios y plan de acción
-- ------------------------------------------------------------
CREATE TABLE escenario_pension (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    diagnostico_f1_id UUID NOT NULL,

    nombre_escenario TEXT NOT NULL,
    orden SMALLINT,

    semanas_proyectadas INTEGER,
    salario_promedio_proyectado NUMERIC(10,2),
    inversion_total_estimada NUMERIC(12,2) DEFAULT 0,
    pension_mensual_estimada NUMERIC(12,2),
    incremento_mensual NUMERIC(12,2),
    meses_recuperacion_inversion NUMERIC(6,1),

    beneficio_a_5_anios NUMERIC(12,2),
    beneficio_a_10_anios NUMERIC(12,2),
    beneficio_a_15_anios NUMERIC(12,2),

    salario_modalidad_40 NUMERIC(10,2),
    meses_modalidad_40 SMALLINT,
    costo_mensual_estimado NUMERIC(12,2)
);


CREATE TABLE plan_accion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    diagnostico_id UUID NOT NULL,

    accion TEXT NOT NULL,
    fecha_objetivo DATE,
    estatus estatus_plan_accion,
    observaciones TEXT
);


CREATE TABLE situacion_patrimonial (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    diagnostico_f1_id UUID NOT NULL UNIQUE,

    saldo_cuenta_individual NUMERIC(12,2),
    aportaciones_voluntarias NUMERIC(12,2),
    ahorros_inversiones_adicionales NUMERIC(12,2),
    bienes_patrimoniales TEXT,
    creditos_deudas_vigentes TEXT,
    ingreso_mensual NUMERIC(12,2),
    otras_fuentes_ingreso TEXT,
    ingreso_conyuge NUMERIC(12,2),
    seguros TEXT,
    estado_salud estado_salud,
    padecimientos TEXT,
    estado_civil estado_civil,
    edad_conyuge SMALLINT,
    actividad_economica_conyuge TEXT
);


CREATE TABLE situacion_patrimonial_hijos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    situacion_patrimonial_id UUID NOT NULL,

    numero_hijos SMALLINT DEFAULT 0,
    tiene_discapacidad BOOLEAN DEFAULT FALSE,
    edad SMALLINT
);


-- ############################################################
-- G. MODALIDADES (APLICACIÓN)
-- ############################################################

CREATE TABLE estatus_modalidad (
    id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE,
    orden SMALLINT NOT NULL,
    es_final BOOLEAN NOT NULL
);


CREATE TABLE modalidades_aplicacion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    cliente_id UUID NOT NULL,
    diagnostico_id UUID NOT NULL,

    estatus_m10_id SMALLINT,
    estatus_m40r_id SMALLINT,
    estatus_m40_id SMALLINT,

    tipo_modalidad tipo_modalidad,

    fecha_cita_imss DATE,
    ultimo_salario_diario_registrado NUMERIC(10,2),

    creado_el TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- ############################################################
-- H. AGENDA Y AVISOS
-- ############################################################

CREATE TABLE eventos_agenda (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    asesor_id UUID NOT NULL,
    cliente_id UUID NOT NULL,

    fecha DATE NOT NULL,
    hora TIME,
    motivo TEXT,
    estatus estatus_evento_agenda
);


CREATE TABLE avisos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    tipo tipo_aviso NOT NULL,

    etapa_tramite_id UUID,
    evento_id UUID,

    fecha_alerta TIMESTAMPTZ NOT NULL,

    atendido BOOLEAN NOT NULL DEFAULT FALSE,
    atendido_por UUID,
    fecha_atencion TIMESTAMPTZ,

    -- Exactamente uno de los dos debe estar lleno
    CONSTRAINT ck_avisos_origen
        CHECK ((etapa_tramite_id IS NOT NULL) <> (evento_id IS NOT NULL))
);


-- ############################################################
-- I. CREDENCIALES E INFORMACIÓN FISCAL
-- ############################################################

CREATE TABLE credenciales_correo_cliente (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    cliente_id UUID NOT NULL UNIQUE,

    correo TEXT NOT NULL,
    contrasena_encriptada TEXT NOT NULL,

    fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_por UUID,

    activo BOOLEAN NOT NULL DEFAULT TRUE
);


CREATE TABLE informacion_fiscal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    cliente_id UUID NOT NULL UNIQUE,

    regimen_fiscal TEXT,
    fecha_registro TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    observaciones TEXT,

    fiel_entregada BOOLEAN NOT NULL DEFAULT FALSE,
    sat_contrasena_entregada BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_confirmacion TIMESTAMPTZ
);
