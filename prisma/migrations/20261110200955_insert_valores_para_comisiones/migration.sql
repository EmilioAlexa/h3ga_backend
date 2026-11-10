-- DropForeignKey
ALTER TABLE "comisiones" DROP CONSTRAINT "fk_comisiones_receptor_dispersion";

-- DropForeignKey
ALTER TABLE "contrato_dispersion_detalle" DROP CONSTRAINT "fk_detalle_dispersion_receptor";

-- RenameForeignKey
ALTER TABLE "historial_estados_comisiones" RENAME CONSTRAINT "fk_historial_estado_comision_anterior" TO "historial_estados_comisiones_estado_anterior_id_fkey";

-- RenameForeignKey
ALTER TABLE "historial_estados_comisiones" RENAME CONSTRAINT "fk_historial_estado_comision_nuevo" TO "historial_estados_comisiones_estado_nuevo_id_fkey";

-- AddForeignKey
ALTER TABLE "comisiones" ADD CONSTRAINT "fk_comisiones_receptor_dispersion" FOREIGN KEY ("receptor_dispersion_id") REFERENCES "receptores_dispersion"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "contrato_dispersion_detalle" ADD CONSTRAINT "fk_detalle_dispersion_receptor" FOREIGN KEY ("receptor_dispersion_id") REFERENCES "receptores_dispersion"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
