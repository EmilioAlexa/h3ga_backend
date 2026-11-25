import { ApiProperty } from '@nestjs/swagger';

export class ResumenDashboard {
  @ApiProperty() clientes_activos!: number;
  @ApiProperty() clientes_pensionados!: number;
  @ApiProperty({ nullable: true }) asesores_activos!: number | null;
  @ApiProperty() acciones_proximas_mes!: number;
  @ApiProperty() documentos_por_confirmar!: number;
  @ApiProperty() documentos_con_observaciones!: number;
  @ApiProperty() clientes_avance_detenido!: number;
}
export class ClientesPorEtapa {
  @ApiProperty() numero_paso!: number;
  @ApiProperty() nombre!: string;
  @ApiProperty() clientes!: number;
}
export class DocumentosPorEstatus {
  @ApiProperty() si!: number;
  @ApiProperty() por_confirmar!: number;
  @ApiProperty() no!: number;
}
export class AccionDelMes {
  @ApiProperty() cliente_id!: string;
  @ApiProperty() cliente_nombre!: string;
  @ApiProperty({ nullable: true }) asesor_id!: string | null;
  @ApiProperty({ nullable: true }) asesor_nombre!: string | null;
  @ApiProperty() numero_paso!: number;
  @ApiProperty() etapa!: string;
  @ApiProperty() fecha_compromiso!: string;
  @ApiProperty({ nullable: true }) accion_a_realizar!: string | null;
  @ApiProperty({ enum: ['completada', 'proxima', 'vencida'] }) estado!: 'completada' | 'proxima' | 'vencida';
}
export class DocumentoPendiente {
  @ApiProperty() documento_id!: string;
  @ApiProperty() cliente_id!: string;
  @ApiProperty() cliente_nombre!: string;
  @ApiProperty() tipo_documento_id!: number;
  @ApiProperty() tipo_documento!: string;
  @ApiProperty({ enum: ['no', 'por_confirmar'] }) estatus!: 'no' | 'por_confirmar';
  @ApiProperty() fecha_carga!: Date;
  @ApiProperty({ nullable: true }) subido_por_id!: string | null;
  @ApiProperty({ nullable: true }) subido_por_nombre!: string | null;
  @ApiProperty() etapa_actual!: string;
}
export class ClienteDetenido {
  @ApiProperty() cliente_id!: string;
  @ApiProperty() cliente_nombre!: string;
  @ApiProperty({ nullable: true }) asesor_id!: string | null;
  @ApiProperty({ nullable: true }) asesor_nombre!: string | null;
  @ApiProperty() etapa_actual!: string;
  @ApiProperty({ nullable: true }) estatus_id!: number | null;
  @ApiProperty({ nullable: true }) estatus!: string | null;
  @ApiProperty({ nullable: true }) ultima_actividad!: string | null;
  @ApiProperty({ nullable: true }) dias_sin_actividad!: number | null;
}
export class CargaPorAsesor {
  @ApiProperty() asesor_id!: string;
  @ApiProperty() asesor_nombre!: string;
  @ApiProperty() clientes_activos!: number;
  @ApiProperty() clientes_detenidos!: number;
  @ApiProperty() clientes_pensionados!: number;
}
export class AvanceClienteEtapa {
  @ApiProperty() numero_paso!: number;
  @ApiProperty() avance_porcentaje!: number;
  @ApiProperty({ nullable: true }) estatus_id!: number | null;
}
export class AvanceCliente {
  @ApiProperty() cliente_id!: string;
  @ApiProperty() cliente_nombre!: string;
  @ApiProperty({ type: [AvanceClienteEtapa] }) etapas!: AvanceClienteEtapa[];
}
export class DashboardRespuesta {
  @ApiProperty() fecha!: string;
  @ApiProperty({ type: ResumenDashboard }) resumen!: ResumenDashboard;
  @ApiProperty({ type: [ClientesPorEtapa] }) clientes_por_etapa!: ClientesPorEtapa[];
  @ApiProperty({ type: DocumentosPorEstatus }) documentos_por_estatus!: DocumentosPorEstatus;
  @ApiProperty({ type: [AccionDelMes] }) acciones_del_mes!: AccionDelMes[];
  @ApiProperty() total_acciones_del_mes!: number;
  @ApiProperty({ type: [DocumentoPendiente] }) documentos_pendientes!: DocumentoPendiente[];
  @ApiProperty() total_documentos_pendientes!: number;
  @ApiProperty({ type: [ClienteDetenido] }) clientes_detenidos!: ClienteDetenido[];
  @ApiProperty({ type: [CargaPorAsesor], nullable: true }) carga_por_asesor!: CargaPorAsesor[] | null;
  @ApiProperty({ type: [AvanceCliente], nullable: true }) avance_por_cliente!: AvanceCliente[] | null;
  @ApiProperty({ nullable: true }) total_avance_por_cliente!: number | null;
}
