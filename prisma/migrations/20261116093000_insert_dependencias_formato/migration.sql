
-- Insertar dependencias institucionales iniciales
-- Evitar duplicados por nombre

INSERT INTO "dependencias_formato" ("nombre")
VALUES
    ('IMSS'),
    ('SAT'),
    ('ISSSTE'),
    ('INFONAVIT')
ON CONFLICT ("nombre") DO NOTHING;
