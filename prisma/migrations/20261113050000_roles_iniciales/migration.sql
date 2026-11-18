-- H3GA: roles iniciales del sistema

INSERT INTO "roles" ("nombre", "descripcion")
SELECT v.nombre, v.descripcion
FROM (
    VALUES
        ('administrador', 'Acceso total al sistema y configuraciones'),
        ('administrador financiero', 'Encargado de la gestion administrativa y financiera'),
        ('asesor', 'Asesor de pensiones')
) AS v(nombre, descripcion)
WHERE NOT EXISTS (
    SELECT 1
    FROM "roles" r
    WHERE LOWER(r."nombre") = LOWER(v.nombre)
);