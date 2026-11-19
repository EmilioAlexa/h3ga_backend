-- I3: estado operativo de clientes. Los registros existentes quedan activos.
ALTER TABLE "clientes" ADD COLUMN "pausado" BOOLEAN NOT NULL DEFAULT false;
