-- ============================================================
-- H3GA FINANZAS
-- Esquema inicial de base de datos
-- PostgreSQL
--
-- Etapa 4 - Modelo de datos
-- Solo estructura: tablas, campos, PK y FK.
-- No contiene datos de negocio.
--
-- PARTE A: se crean TODAS las tablas (con PK, UNIQUE, NOT NULL, DEFAULT)
-- PARTE B: se agregan TODAS las llaves foráneas con ALTER TABLE
-- ============================================================

-- ############################################################
-- PARTE A. CREACIÓN DE TABLAS (sin llaves foráneas)
-- ############################################################

-- ============================================================
-- 1. TABLAS COMPARTIDAS
-- ============================================================

CREATE TABLE roles (
    id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE,
    descripcion TEXT
);

CREATE TABLE usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rol_id SMALLINT NOT NULL,
    nombre TEXT NOT NULL,
    apellido_paterno TEXT NOT NULL,
    apellido_materno TEXT,
    correo_electronico TEXT NOT NULL UNIQUE,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    grupo_principal_id SMALLINT,
    nombre TEXT NOT NULL,
    apellido_paterno TEXT NOT NULL,
    apellido_materno TEXT,

    referido_por TEXT,
    telefono TEXT,

    asesor_id UUID,

    fecha_ingreso DATE,
    correo_electronico TEXT,

    curp VARCHAR(18),
    rfc VARCHAR(13),

    fecha_nacimiento DATE,

    estado_civil TEXT,

    dependientes_economicos INTEGER,

    regimen_id SMALLINT,

    nss VARCHAR(11),

    ley_probable_id SMALLINT,

    semanas_imss_reconocidas INTEGER,
    semanas_a_recuperar INTEGER,

    tiene_issste TEXT,

    afore_id SMALLINT,

    observaciones_generales TEXT,

    requiere_contadora TEXT,

    sexo TEXT,

    ocupacion TEXT,
    domicilio TEXT,
    estado TEXT,

    subdelegacion_imss_probable TEXT,

    cambio_afore TEXT,

    ine VARCHAR(18),

    objetivo_cliente TEXT
);

-- ============================================================
-- 2. NÚCLEO FINANCIERO
-- ============================================================

CREATE TABLE servicios (
    id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE,
    descripcion TEXT,
    activo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE estados_contratos (
    id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    descripcion TEXT,
    orden SMALLINT NOT NULL
);

CREATE TABLE contratos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    cliente_id UUID NOT NULL,
    servicio_id SMALLINT NOT NULL,
    asesor_id UUID NOT NULL,

    folio VARCHAR(50) NOT NULL,

    fecha_contrato DATE NOT NULL,

    estado_contrato_id SMALLINT NOT NULL,

    cantidad_pagos SMALLINT,

    observaciones TEXT,

    creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 3. SEGUIMIENTO MODALIDAD 10
-- ============================================================

CREATE TABLE seguimiento_m10 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    contrato_id UUID NOT NULL,

    fecha_inicio_tramite DATE,
    fecha_tramite_pago DATE,

    monto_pago_inscripcion NUMERIC(12,2),
    monto_mensual NUMERIC(12,2),

    periodo_contrato TEXT,

    observaciones TEXT,

    CONSTRAINT uq_seguimiento_m10_contrato
        UNIQUE (contrato_id)
);

-- ============================================================
-- 4. SEGUIMIENTO MODALIDAD 40
-- ============================================================

CREATE TABLE seguimiento_m40 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    contrato_id UUID NOT NULL,

    fecha_inicio DATE,
    fecha_fin DATE,

    salario_diario NUMERIC(10,2),

    cantidad_meses SMALLINT,

    monto_mensual NUMERIC(12,2),

    observaciones TEXT,

    CONSTRAINT uq_seguimiento_m40_contrato
        UNIQUE (contrato_id)
);

-- ============================================================
-- 5. SEGUIMIENTO MODALIDAD 40 RETROACTIVA
-- ============================================================

CREATE TABLE seguimiento_m40_retroactiva (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    contrato_id UUID NOT NULL,

    fecha_solicitud DATE,
    fecha_inicio_retroactivo DATE,
    fecha_fin_retroactivo DATE,

    meses_retroactivos SMALLINT,

    salario_diario NUMERIC(10,2),

    monto_estimado NUMERIC(12,2),
    monto_confirmado NUMERIC(12,2),

    observaciones TEXT,

    CONSTRAINT uq_seguimiento_m40_retroactiva_contrato
        UNIQUE (contrato_id)
);

-- ============================================================
-- 6. SEGUIMIENTO APD
-- ============================================================

CREATE TABLE seguimiento_apd (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    contrato_id UUID NOT NULL,

    tipo_venta_id SMALLINT,
    modalidad_apd_id SMALLINT,
    proveedor_id SMALLINT,

    fecha_alta DATE,
    fecha_baja DATE,
    fecha_reingreso DATE,

    fecha_alta_reingreso DATE,
    fecha_baja_reingreso DATE,

    fecha_solicitud_recursos DATE,
    fecha_reflejo_recursos DATE,

    monto_recurso_cliente NUMERIC(12,2),

    porcentaje_cobro NUMERIC(5,2),

    monto_cobro_esperado NUMERIC(12,2),

    fecha_cobro_cliente DATE,

    observaciones TEXT,

    CONSTRAINT uq_seguimiento_apd_contrato
        UNIQUE (contrato_id)
);

-- ============================================================
-- 7. CATÁLOGOS APD
-- ============================================================

CREATE TABLE tipos_venta (
    id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    descripcion TEXT,
    activo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE modalidades_apd (
    id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    descripcion TEXT,
    activo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE tipos_cobro (
    id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    descripcion TEXT,
    activo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE proveedores (
    id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    descripcion TEXT,
    activo BOOLEAN NOT NULL DEFAULT TRUE
);

-- ============================================================
-- 8. PAGOS PROGRAMADOS
-- ============================================================

CREATE TABLE estados_pago_programado (
    id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre VARCHAR(30) NOT NULL UNIQUE,
    descripcion TEXT
);

CREATE TABLE pagos_programados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    contrato_id UUID NOT NULL,

    tipo_cobro_id SMALLINT,

    numero_pago INTEGER NOT NULL,

    fecha_esperada DATE,
    fecha_vencimiento DATE,

    monto_esperado NUMERIC(12,2),

    periodo DATE,

    estado_id SMALLINT
);

-- ============================================================
-- 9. PAGOS
-- ============================================================

CREATE TABLE estados_pago (
    id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    orden SMALLINT NOT NULL
);

CREATE TABLE formas_pago (
    id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    activo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE pagos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    contrato_id UUID NOT NULL,

    pago_programado_id UUID,

    forma_pago_id SMALLINT,

    estado_pago_id SMALLINT,

    monto NUMERIC(12,2) NOT NULL,

    fecha_pago TIMESTAMPTZ,

    registrado_por UUID,

    fecha_registro TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    observaciones TEXT,

    referencia_pago VARCHAR(100)
);

-- ============================================================
-- 10. EVIDENCIAS DE PAGO
-- ============================================================

CREATE TABLE tipos_evidencia_pago (
    id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    descripcion TEXT
);

CREATE TABLE evidencias_pago (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    pago_id UUID NOT NULL,

    tipo_evidencia_id SMALLINT,

    archivo_path TEXT NOT NULL,
    nombre_original TEXT,
    tipo_archivo TEXT,

    subido_por UUID,

    fecha_carga TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    hash_archivo VARCHAR(128)
);

-- ============================================================
-- 11. HISTORIAL DE ESTADOS DE PAGO
-- ============================================================

CREATE TABLE historial_estados_pago (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    pago_id UUID NOT NULL,

    estado_anterior_id SMALLINT,
    estado_nuevo_id SMALLINT,

    cambiado_por UUID,

    fecha_cambio TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    comentario TEXT
);

-- ============================================================
-- 12. CORTES FINANCIEROS
-- ============================================================

CREATE TABLE estados_corte (
    id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre VARCHAR(20) NOT NULL UNIQUE,
    descripcion TEXT
);

CREATE TABLE cortes_financieros (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    numero_corte INTEGER NOT NULL,

    fecha_inicio TIMESTAMPTZ NOT NULL,
    fecha_fin TIMESTAMPTZ NOT NULL,

    estado_id SMALLINT NOT NULL,

    creado_por UUID NOT NULL,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    cerrado_por UUID,
    cerrado_en TIMESTAMPTZ
);

CREATE TABLE detalle_corte (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    corte_id UUID NOT NULL,
    pago_id UUID NOT NULL,

    monto NUMERIC(12,2) NOT NULL,

    CONSTRAINT uq_detalle_corte_pago
        UNIQUE (corte_id, pago_id)
);

-- ============================================================
-- 13. COMISIONES
-- ============================================================

CREATE TABLE tipos_asesor (
    id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    descripcion TEXT,
    activo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE configuracion_comisiones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    asesor_id UUID NOT NULL,

    tipo_asesor_id SMALLINT NOT NULL,

    porcentaje NUMERIC(5,2) NOT NULL,

    vigencia_desde DATE NOT NULL,
    vigencia_hasta DATE,

    activo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE estados_comisiones (
    id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre VARCHAR(30) NOT NULL UNIQUE,
    descripcion TEXT
);

CREATE TABLE comisiones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    pago_id UUID NOT NULL,

    asesor_id UUID NOT NULL,

    porcentaje NUMERIC(5,2) NOT NULL,

    monto_base NUMERIC(12,2) NOT NULL,

    monto_comision NUMERIC(12,2) NOT NULL,

    estado_id SMALLINT NOT NULL,

    fecha_calculo TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    observaciones TEXT
);

-- ============================================================
-- 14. PRENÓMINA
-- ============================================================

CREATE TABLE estados_prenomina (
    id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre VARCHAR(30) NOT NULL UNIQUE,
    descripcion TEXT
);

CREATE TABLE prenomina (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    corte_id UUID NOT NULL,

    estado_id SMALLINT NOT NULL,

    creado_por UUID NOT NULL,

    creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    total_referencial NUMERIC(12,2),

    observaciones TEXT
);

CREATE TABLE detalle_prenomina (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    prenomina_id UUID NOT NULL,

    asesor_id UUID NOT NULL,

    monto_referencial NUMERIC(12,2),

    observaciones TEXT
);

-- ############################################################
-- PARTE B. LLAVES FORÁNEAS (ALTER TABLE)
-- ############################################################

-- ------------------------------------------------------------
-- usuarios
-- ------------------------------------------------------------
ALTER TABLE usuarios
    ADD CONSTRAINT fk_usuarios_rol
        FOREIGN KEY (rol_id)
        REFERENCES roles(id);

-- ------------------------------------------------------------
-- clientes
-- ------------------------------------------------------------
ALTER TABLE clientes
    ADD CONSTRAINT fk_clientes_asesor
        FOREIGN KEY (asesor_id)
        REFERENCES usuarios(id);

-- ------------------------------------------------------------
-- contratos
-- ------------------------------------------------------------
ALTER TABLE contratos
    ADD CONSTRAINT fk_contratos_cliente
        FOREIGN KEY (cliente_id)
        REFERENCES clientes(id);

ALTER TABLE contratos
    ADD CONSTRAINT fk_contratos_servicio
        FOREIGN KEY (servicio_id)
        REFERENCES servicios(id);

ALTER TABLE contratos
    ADD CONSTRAINT fk_contratos_asesor
        FOREIGN KEY (asesor_id)
        REFERENCES usuarios(id);

ALTER TABLE contratos
    ADD CONSTRAINT fk_contratos_estado
        FOREIGN KEY (estado_contrato_id)
        REFERENCES estados_contratos(id);

-- ------------------------------------------------------------
-- seguimiento_m10
-- ------------------------------------------------------------
ALTER TABLE seguimiento_m10
    ADD CONSTRAINT fk_seguimiento_m10_contrato
        FOREIGN KEY (contrato_id)
        REFERENCES contratos(id)
        ON DELETE CASCADE;

-- ------------------------------------------------------------
-- seguimiento_m40
-- ------------------------------------------------------------
ALTER TABLE seguimiento_m40
    ADD CONSTRAINT fk_seguimiento_m40_contrato
        FOREIGN KEY (contrato_id)
        REFERENCES contratos(id)
        ON DELETE CASCADE;

-- ------------------------------------------------------------
-- seguimiento_m40_retroactiva
-- ------------------------------------------------------------
ALTER TABLE seguimiento_m40_retroactiva
    ADD CONSTRAINT fk_seguimiento_m40_retroactiva_contrato
        FOREIGN KEY (contrato_id)
        REFERENCES contratos(id)
        ON DELETE CASCADE;

-- ------------------------------------------------------------
-- seguimiento_apd
-- ------------------------------------------------------------
ALTER TABLE seguimiento_apd
    ADD CONSTRAINT fk_seguimiento_apd_contrato
        FOREIGN KEY (contrato_id)
        REFERENCES contratos(id)
        ON DELETE CASCADE;

ALTER TABLE seguimiento_apd
    ADD CONSTRAINT fk_seguimiento_apd_tipo_venta
        FOREIGN KEY (tipo_venta_id)
        REFERENCES tipos_venta(id);

ALTER TABLE seguimiento_apd
    ADD CONSTRAINT fk_seguimiento_apd_modalidad
        FOREIGN KEY (modalidad_apd_id)
        REFERENCES modalidades_apd(id);

ALTER TABLE seguimiento_apd
    ADD CONSTRAINT fk_seguimiento_apd_proveedor
        FOREIGN KEY (proveedor_id)
        REFERENCES proveedores(id);

-- ------------------------------------------------------------
-- pagos_programados
-- ------------------------------------------------------------
ALTER TABLE pagos_programados
    ADD CONSTRAINT fk_pagos_programados_contrato
        FOREIGN KEY (contrato_id)
        REFERENCES contratos(id)
        ON DELETE CASCADE;

ALTER TABLE pagos_programados
    ADD CONSTRAINT fk_pagos_programados_tipo_cobro
        FOREIGN KEY (tipo_cobro_id)
        REFERENCES tipos_cobro(id);

ALTER TABLE pagos_programados
    ADD CONSTRAINT fk_pagos_programados_estado
        FOREIGN KEY (estado_id)
        REFERENCES estados_pago_programado(id);

-- ------------------------------------------------------------
-- pagos
-- ------------------------------------------------------------
ALTER TABLE pagos
    ADD CONSTRAINT fk_pagos_contrato
        FOREIGN KEY (contrato_id)
        REFERENCES contratos(id);

ALTER TABLE pagos
    ADD CONSTRAINT fk_pagos_programado
        FOREIGN KEY (pago_programado_id)
        REFERENCES pagos_programados(id);

ALTER TABLE pagos
    ADD CONSTRAINT fk_pagos_forma
        FOREIGN KEY (forma_pago_id)
        REFERENCES formas_pago(id);

ALTER TABLE pagos
    ADD CONSTRAINT fk_pagos_estado
        FOREIGN KEY (estado_pago_id)
        REFERENCES estados_pago(id);

ALTER TABLE pagos
    ADD CONSTRAINT fk_pagos_usuario
        FOREIGN KEY (registrado_por)
        REFERENCES usuarios(id);

-- ------------------------------------------------------------
-- evidencias_pago
-- ------------------------------------------------------------
ALTER TABLE evidencias_pago
    ADD CONSTRAINT fk_evidencias_pago
        FOREIGN KEY (pago_id)
        REFERENCES pagos(id)
        ON DELETE CASCADE;

ALTER TABLE evidencias_pago
    ADD CONSTRAINT fk_evidencias_tipo
        FOREIGN KEY (tipo_evidencia_id)
        REFERENCES tipos_evidencia_pago(id);

ALTER TABLE evidencias_pago
    ADD CONSTRAINT fk_evidencias_usuario
        FOREIGN KEY (subido_por)
        REFERENCES usuarios(id);

-- ------------------------------------------------------------
-- historial_estados_pago
-- ------------------------------------------------------------
ALTER TABLE historial_estados_pago
    ADD CONSTRAINT fk_historial_pago
        FOREIGN KEY (pago_id)
        REFERENCES pagos(id)
        ON DELETE CASCADE;

ALTER TABLE historial_estados_pago
    ADD CONSTRAINT fk_historial_estado_anterior
        FOREIGN KEY (estado_anterior_id)
        REFERENCES estados_pago(id);

ALTER TABLE historial_estados_pago
    ADD CONSTRAINT fk_historial_estado_nuevo
        FOREIGN KEY (estado_nuevo_id)
        REFERENCES estados_pago(id);

ALTER TABLE historial_estados_pago
    ADD CONSTRAINT fk_historial_usuario
        FOREIGN KEY (cambiado_por)
        REFERENCES usuarios(id);

-- ------------------------------------------------------------
-- cortes_financieros
-- ------------------------------------------------------------
ALTER TABLE cortes_financieros
    ADD CONSTRAINT fk_cortes_estado
        FOREIGN KEY (estado_id)
        REFERENCES estados_corte(id);

ALTER TABLE cortes_financieros
    ADD CONSTRAINT fk_cortes_creado_por
        FOREIGN KEY (creado_por)
        REFERENCES usuarios(id);

ALTER TABLE cortes_financieros
    ADD CONSTRAINT fk_cortes_cerrado_por
        FOREIGN KEY (cerrado_por)
        REFERENCES usuarios(id);

-- ------------------------------------------------------------
-- detalle_corte
-- ------------------------------------------------------------
ALTER TABLE detalle_corte
    ADD CONSTRAINT fk_detalle_corte
        FOREIGN KEY (corte_id)
        REFERENCES cortes_financieros(id)
        ON DELETE CASCADE;

ALTER TABLE detalle_corte
    ADD CONSTRAINT fk_detalle_corte_pago
        FOREIGN KEY (pago_id)
        REFERENCES pagos(id);

-- ------------------------------------------------------------
-- configuracion_comisiones
-- ------------------------------------------------------------
ALTER TABLE configuracion_comisiones
    ADD CONSTRAINT fk_config_comision_asesor
        FOREIGN KEY (asesor_id)
        REFERENCES usuarios(id);

ALTER TABLE configuracion_comisiones
    ADD CONSTRAINT fk_config_comision_tipo
        FOREIGN KEY (tipo_asesor_id)
        REFERENCES tipos_asesor(id);

-- ------------------------------------------------------------
-- comisiones
-- ------------------------------------------------------------
ALTER TABLE comisiones
    ADD CONSTRAINT fk_comisiones_pago
        FOREIGN KEY (pago_id)
        REFERENCES pagos(id);

ALTER TABLE comisiones
    ADD CONSTRAINT fk_comisiones_asesor
        FOREIGN KEY (asesor_id)
        REFERENCES usuarios(id);

ALTER TABLE comisiones
    ADD CONSTRAINT fk_comisiones_estado
        FOREIGN KEY (estado_id)
        REFERENCES estados_comisiones(id);

-- ------------------------------------------------------------
-- prenomina
-- ------------------------------------------------------------
ALTER TABLE prenomina
    ADD CONSTRAINT fk_prenomina_corte
        FOREIGN KEY (corte_id)
        REFERENCES cortes_financieros(id);

ALTER TABLE prenomina
    ADD CONSTRAINT fk_prenomina_estado
        FOREIGN KEY (estado_id)
        REFERENCES estados_prenomina(id);

ALTER TABLE prenomina
    ADD CONSTRAINT fk_prenomina_usuario
        FOREIGN KEY (creado_por)
        REFERENCES usuarios(id);

-- ------------------------------------------------------------
-- detalle_prenomina
-- ------------------------------------------------------------
ALTER TABLE detalle_prenomina
    ADD CONSTRAINT fk_detalle_prenomina
        FOREIGN KEY (prenomina_id)
        REFERENCES prenomina(id)
        ON DELETE CASCADE;

ALTER TABLE detalle_prenomina
    ADD CONSTRAINT fk_detalle_prenomina_asesor
        FOREIGN KEY (asesor_id)
        REFERENCES usuarios(id);