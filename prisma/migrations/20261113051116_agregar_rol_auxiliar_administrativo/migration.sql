-- H3GA: agregar rol Auxiliar Administrativo
-- Migración de datos para entorno de pruebas.

INSERT INTO "roles" ("nombre", "descripcion")
SELECT
    'auxiliar administrativo',
    'Apoyo administrativo en la gestión de clientes, documentos y tareas asignadas.'
WHERE NOT EXISTS (
    SELECT 1
    FROM "roles"
    WHERE LOWER("nombre") = 'auxiliar administrativo'
);