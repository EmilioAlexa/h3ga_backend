-- ============================================================
-- H3GA RUTA
-- SCRIPT 2: Llaves foráneas (ALTER TABLE)
-- PostgreSQL
--
-- Ejecutar DESPUÉS de 01_crear_tablas_ruta.sql
--
-- Criterio de ON DELETE:
--   * CASCADE  -> tablas hijas/puente que no tienen sentido sin su padre
--                 (detalles del diagnóstico, criterios, secundarios, etc.)
--   * Sin regla (NO ACTION) -> catálogos, usuarios y tablas principales
--                 ligadas a clientes, para no borrar historial por accidente.
-- ============================================================


-- ############################################################
-- A. TABLAS YA EXISTENTES -> NUEVOS CATÁLOGOS
-- ############################################################

-- clientes
ALTER TABLE clientes
    ADD CONSTRAINT fk_clientes_grupo_principal
        FOREIGN KEY (grupo_principal_id)
        REFERENCES grupos_principales(id);

ALTER TABLE clientes
    ADD CONSTRAINT fk_clientes_regimen
        FOREIGN KEY (regimen_id)
        REFERENCES regimen_principal(id);

ALTER TABLE clientes
    ADD CONSTRAINT fk_clientes_ley_probable
        FOREIGN KEY (ley_probable_id)
        REFERENCES ley_probable(id);

ALTER TABLE clientes
    ADD CONSTRAINT fk_clientes_afore
        FOREIGN KEY (afore_id)
        REFERENCES afore(id);


-- ############################################################
-- B. CATÁLOGOS
-- ############################################################

-- grupos_principales
ALTER TABLE grupos_principales
    ADD CONSTRAINT fk_grupos_principales_division
        FOREIGN KEY (division_id)
        REFERENCES divisiones(id);


-- ############################################################
-- C. SEGUIMIENTO DE ETAPAS DEL TRÁMITE
-- ############################################################

-- etapas_tramite
ALTER TABLE etapas_tramite
    ADD CONSTRAINT fk_etapas_tramite_cliente
        FOREIGN KEY (cliente_id)
        REFERENCES clientes(id);

ALTER TABLE etapas_tramite
    ADD CONSTRAINT fk_etapas_tramite_etapa
        FOREIGN KEY (etapa_id)
        REFERENCES etapas_proceso(id);

ALTER TABLE etapas_tramite
    ADD CONSTRAINT fk_etapas_tramite_estatus
        FOREIGN KEY (estatus_id)
        REFERENCES estatus_tramite(id);


-- etapas_tramite_historial
ALTER TABLE etapas_tramite_historial
    ADD CONSTRAINT fk_etapas_historial_etapa_tramite
        FOREIGN KEY (etapa_tramite_id)
        REFERENCES etapas_tramite(id);

ALTER TABLE etapas_tramite_historial
    ADD CONSTRAINT fk_etapas_historial_estatus_anterior
        FOREIGN KEY (estatus_anterior_id)
        REFERENCES estatus_tramite(id);

ALTER TABLE etapas_tramite_historial
    ADD CONSTRAINT fk_etapas_historial_estatus_nuevo
        FOREIGN KEY (estatus_nuevo_id)
        REFERENCES estatus_tramite(id);

ALTER TABLE etapas_tramite_historial
    ADD CONSTRAINT fk_etapas_historial_usuario
        FOREIGN KEY (cambiado_por)
        REFERENCES usuarios(id);


-- ############################################################
-- D. DOCUMENTOS DEL CLIENTE
-- ############################################################

-- documentos_clientes
ALTER TABLE documentos_clientes
    ADD CONSTRAINT fk_documentos_clientes_cliente
        FOREIGN KEY (cliente_id)
        REFERENCES clientes(id);

ALTER TABLE documentos_clientes
    ADD CONSTRAINT fk_documentos_clientes_tipo
        FOREIGN KEY (tipo_documento_id)
        REFERENCES tipo_documento(id);

ALTER TABLE documentos_clientes
    ADD CONSTRAINT fk_documentos_clientes_usuario
        FOREIGN KEY (subido_por)
        REFERENCES usuarios(id);


-- ############################################################
-- E. ETAPA 0 - DIAGNÓSTICO INICIAL
-- ############################################################

-- historial_laboral
ALTER TABLE historial_laboral
    ADD CONSTRAINT fk_historial_laboral_cliente
        FOREIGN KEY (cliente_id)
        REFERENCES clientes(id);

-- informacion_issste
ALTER TABLE informacion_issste
    ADD CONSTRAINT fk_informacion_issste_historial
        FOREIGN KEY (historial_laboral_id)
        REFERENCES historial_laboral(id);

-- correcciones_cliente
ALTER TABLE correcciones_cliente
    ADD CONSTRAINT fk_correcciones_cliente_cliente
        FOREIGN KEY (cliente_id)
        REFERENCES clientes(id);

ALTER TABLE correcciones_cliente
    ADD CONSTRAINT fk_correcciones_cliente_tipo
        FOREIGN KEY (tipo_correccion_id)
        REFERENCES tipo_correccion(id);

-- unificacion_nss_detalle
ALTER TABLE unificacion_nss_detalle
    ADD CONSTRAINT fk_unificacion_nss_detalle_correccion
        FOREIGN KEY (correccion_id)
        REFERENCES correcciones_cliente(id)
        ON DELETE CASCADE;

-- unificacion_nss_secundarios
ALTER TABLE unificacion_nss_secundarios
    ADD CONSTRAINT fk_unificacion_nss_secundarios_detalle
        FOREIGN KEY (unificacion_id)
        REFERENCES unificacion_nss_detalle(id)
        ON DELETE CASCADE;

-- cliente_objetivos_especificos
ALTER TABLE cliente_objetivos_especificos
    ADD CONSTRAINT fk_cliente_objetivos_cliente
        FOREIGN KEY (cliente_id)
        REFERENCES clientes(id)
        ON DELETE CASCADE;

ALTER TABLE cliente_objetivos_especificos
    ADD CONSTRAINT fk_cliente_objetivos_objetivo
        FOREIGN KEY (objetivo_id)
        REFERENCES objetivo_especifico_inicial(id);


-- ############################################################
-- F. ETAPA 1 - DIAGNÓSTICO ESPECIALIZADO
-- ############################################################

-- diagnostico_especializado
ALTER TABLE diagnostico_especializado
    ADD CONSTRAINT fk_diagnostico_cliente
        FOREIGN KEY (cliente_id)
        REFERENCES clientes(id);

ALTER TABLE diagnostico_especializado
    ADD CONSTRAINT fk_diagnostico_asesor
        FOREIGN KEY (asesor_id)
        REFERENCES usuarios(id);


-- diagnostico_estrategias_recomendadas
ALTER TABLE diagnostico_estrategias_recomendadas
    ADD CONSTRAINT fk_diag_estrategias_diagnostico
        FOREIGN KEY (diagnostico_id)
        REFERENCES diagnostico_especializado(id)
        ON DELETE CASCADE;

ALTER TABLE diagnostico_estrategias_recomendadas
    ADD CONSTRAINT fk_diag_estrategias_estrategia
        FOREIGN KEY (estrategia_id)
        REFERENCES estrategia_recomendada_tipo(id);


-- diagnostico_objetivos
ALTER TABLE diagnostico_objetivos
    ADD CONSTRAINT fk_diag_objetivos_diagnostico
        FOREIGN KEY (diagnostico_id)
        REFERENCES diagnostico_especializado(id)
        ON DELETE CASCADE;

ALTER TABLE diagnostico_objetivos
    ADD CONSTRAINT fk_diag_objetivos_objetivo
        FOREIGN KEY (objetivo_id)
        REFERENCES objetivo_diagnostico(id);


-- diagnostico_inconsistencias_generales
ALTER TABLE diagnostico_inconsistencias_generales
    ADD CONSTRAINT fk_diag_inconsistencias_diagnostico
        FOREIGN KEY (diagnostico_id)
        REFERENCES diagnostico_especializado(id)
        ON DELETE CASCADE;

ALTER TABLE diagnostico_inconsistencias_generales
    ADD CONSTRAINT fk_diag_inconsistencias_tipo
        FOREIGN KEY (tipo_id)
        REFERENCES tipo_inconsistencia_detectada(id);


-- periodos_inconsistencias
ALTER TABLE periodos_inconsistencias
    ADD CONSTRAINT fk_periodos_inconsistencias_cliente
        FOREIGN KEY (cliente_id)
        REFERENCES clientes(id);


-- analisis_recuperacion_semanas
ALTER TABLE analisis_recuperacion_semanas
    ADD CONSTRAINT fk_analisis_recuperacion_diagnostico
        FOREIGN KEY (diagnostico_id)
        REFERENCES diagnostico_especializado(id)
        ON DELETE CASCADE;


-- recuperacion_gestiones
ALTER TABLE recuperacion_gestiones
    ADD CONSTRAINT fk_recuperacion_gestiones_analisis
        FOREIGN KEY (analisis_id)
        REFERENCES analisis_recuperacion_semanas(id)
        ON DELETE CASCADE;

ALTER TABLE recuperacion_gestiones
    ADD CONSTRAINT fk_recuperacion_gestiones_tipo
        FOREIGN KEY (tipo_gestion_id)
        REFERENCES tipo_gestion_recuperacion(id);


-- recuperacion_evidencias
ALTER TABLE recuperacion_evidencias
    ADD CONSTRAINT fk_recuperacion_evidencias_analisis
        FOREIGN KEY (analisis_id)
        REFERENCES analisis_recuperacion_semanas(id)
        ON DELETE CASCADE;

ALTER TABLE recuperacion_evidencias
    ADD CONSTRAINT fk_recuperacion_evidencias_tipo
        FOREIGN KEY (tipo_evidencia_id)
        REFERENCES tipo_evidencia_recuperacion(id);


-- diagnostico_objetivos_m10
ALTER TABLE diagnostico_objetivos_m10
    ADD CONSTRAINT fk_diag_objetivos_m10_diagnostico
        FOREIGN KEY (diagnostico_id)
        REFERENCES diagnostico_especializado(id)
        ON DELETE CASCADE;

ALTER TABLE diagnostico_objetivos_m10
    ADD CONSTRAINT fk_diag_objetivos_m10_objetivo
        FOREIGN KEY (objetivo_id)
        REFERENCES objetivo_modalidad_10(id);


-- modalidad10_criterios
ALTER TABLE modalidad10_criterios
    ADD CONSTRAINT fk_modalidad10_criterios_diagnostico
        FOREIGN KEY (diagnostico_id)
        REFERENCES diagnostico_especializado(id)
        ON DELETE CASCADE;


-- diagnostico_objetivos_m40
ALTER TABLE diagnostico_objetivos_m40
    ADD CONSTRAINT fk_diag_objetivos_m40_diagnostico
        FOREIGN KEY (diagnostico_id)
        REFERENCES diagnostico_especializado(id)
        ON DELETE CASCADE;

ALTER TABLE diagnostico_objetivos_m40
    ADD CONSTRAINT fk_diag_objetivos_m40_objetivo
        FOREIGN KEY (objetivo_id)
        REFERENCES objetivo_modalidad_40(id);


-- modalidad40_criterios
ALTER TABLE modalidad40_criterios
    ADD CONSTRAINT fk_modalidad40_criterios_diagnostico
        FOREIGN KEY (diagnostico_id)
        REFERENCES diagnostico_especializado(id)
        ON DELETE CASCADE;


-- analisis_modalidad40_retroactivo
ALTER TABLE analisis_modalidad40_retroactivo
    ADD CONSTRAINT fk_analisis_m40_retro_diagnostico
        FOREIGN KEY (diagnostico_id)
        REFERENCES diagnostico_especializado(id)
        ON DELETE CASCADE;


-- retroactivo_evaluacion_conveniencia
ALTER TABLE retroactivo_evaluacion_conveniencia
    ADD CONSTRAINT fk_retroactivo_evaluacion_retroactivo
        FOREIGN KEY (retroactivo_id)
        REFERENCES analisis_modalidad40_retroactivo(id)
        ON DELETE CASCADE;


-- escenario_pension
ALTER TABLE escenario_pension
    ADD CONSTRAINT fk_escenario_pension_diagnostico
        FOREIGN KEY (diagnostico_f1_id)
        REFERENCES diagnostico_especializado(id)
        ON DELETE CASCADE;


-- plan_accion
ALTER TABLE plan_accion
    ADD CONSTRAINT fk_plan_accion_diagnostico
        FOREIGN KEY (diagnostico_id)
        REFERENCES diagnostico_especializado(id)
        ON DELETE CASCADE;


-- situacion_patrimonial
ALTER TABLE situacion_patrimonial
    ADD CONSTRAINT fk_situacion_patrimonial_diagnostico
        FOREIGN KEY (diagnostico_f1_id)
        REFERENCES diagnostico_especializado(id)
        ON DELETE CASCADE;


-- situacion_patrimonial_hijos
ALTER TABLE situacion_patrimonial_hijos
    ADD CONSTRAINT fk_situacion_patrimonial_hijos_situacion
        FOREIGN KEY (situacion_patrimonial_id)
        REFERENCES situacion_patrimonial(id)
        ON DELETE CASCADE;


-- ############################################################
-- G. MODALIDADES (APLICACIÓN)
-- ############################################################

-- modalidades_aplicacion
ALTER TABLE modalidades_aplicacion
    ADD CONSTRAINT fk_modalidades_aplicacion_cliente
        FOREIGN KEY (cliente_id)
        REFERENCES clientes(id);

ALTER TABLE modalidades_aplicacion
    ADD CONSTRAINT fk_modalidades_aplicacion_diagnostico
        FOREIGN KEY (diagnostico_id)
        REFERENCES diagnostico_especializado(id);

ALTER TABLE modalidades_aplicacion
    ADD CONSTRAINT fk_modalidades_aplicacion_estatus_m10
        FOREIGN KEY (estatus_m10_id)
        REFERENCES estatus_modalidad(id);

ALTER TABLE modalidades_aplicacion
    ADD CONSTRAINT fk_modalidades_aplicacion_estatus_m40r
        FOREIGN KEY (estatus_m40r_id)
        REFERENCES estatus_modalidad(id);

ALTER TABLE modalidades_aplicacion
    ADD CONSTRAINT fk_modalidades_aplicacion_estatus_m40
        FOREIGN KEY (estatus_m40_id)
        REFERENCES estatus_modalidad(id);


-- ############################################################
-- H. AGENDA Y AVISOS
-- ############################################################

-- eventos_agenda
ALTER TABLE eventos_agenda
    ADD CONSTRAINT fk_eventos_agenda_asesor
        FOREIGN KEY (asesor_id)
        REFERENCES usuarios(id);

ALTER TABLE eventos_agenda
    ADD CONSTRAINT fk_eventos_agenda_cliente
        FOREIGN KEY (cliente_id)
        REFERENCES clientes(id);

-- avisos
ALTER TABLE avisos
    ADD CONSTRAINT fk_avisos_etapa_tramite
        FOREIGN KEY (etapa_tramite_id)
        REFERENCES etapas_tramite(id);

ALTER TABLE avisos
    ADD CONSTRAINT fk_avisos_evento
        FOREIGN KEY (evento_id)
        REFERENCES eventos_agenda(id);

ALTER TABLE avisos
    ADD CONSTRAINT fk_avisos_atendido_por
        FOREIGN KEY (atendido_por)
        REFERENCES usuarios(id);


-- ############################################################
-- I. CREDENCIALES E INFORMACIÓN FISCAL
-- ############################################################

-- credenciales_correo_cliente
ALTER TABLE credenciales_correo_cliente
    ADD CONSTRAINT fk_credenciales_correo_cliente
        FOREIGN KEY (cliente_id)
        REFERENCES clientes(id);

ALTER TABLE credenciales_correo_cliente
    ADD CONSTRAINT fk_credenciales_correo_usuario
        FOREIGN KEY (actualizado_por)
        REFERENCES usuarios(id);

-- informacion_fiscal
ALTER TABLE informacion_fiscal
    ADD CONSTRAINT fk_informacion_fiscal_cliente
        FOREIGN KEY (cliente_id)
        REFERENCES clientes(id);

