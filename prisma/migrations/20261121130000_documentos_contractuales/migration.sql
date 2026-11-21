-- PROPUESTA FORMAL NO APLICADA. Aditiva, sin backfill ni generacion de obligaciones.
BEGIN;
CREATE TABLE public.documentos_contrato (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 contrato_id uuid NOT NULL,
 subido_por uuid NOT NULL,
 solicitud_id uuid NOT NULL,
 nombre_original varchar(255) NOT NULL CHECK (length(btrim(nombre_original)) > 0),
 mime_type varchar(50) NOT NULL CHECK (mime_type IN ('application/pdf','image/jpeg','image/png')),
 tamano_bytes integer NOT NULL CHECK (tamano_bytes > 0 AND tamano_bytes <= 10485760),
 clave_privada text NOT NULL CHECK (clave_privada ~ '^(local|s3):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png)$'),
 sha256 varchar(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
 creado_en timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT documentos_contrato_contrato_id_fkey FOREIGN KEY (contrato_id) REFERENCES public.contratos(id) ON DELETE RESTRICT ON UPDATE NO ACTION,
 CONSTRAINT documentos_contrato_subido_por_fkey FOREIGN KEY (subido_por) REFERENCES public.usuarios(id) ON DELETE RESTRICT ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX uq_documentos_contrato_clave ON public.documentos_contrato(clave_privada);
CREATE UNIQUE INDEX uq_documentos_contrato_solicitud ON public.documentos_contrato(contrato_id,solicitud_id);
CREATE INDEX ix_documentos_contrato_fecha ON public.documentos_contrato(contrato_id,creado_en,id);

COMMIT;
