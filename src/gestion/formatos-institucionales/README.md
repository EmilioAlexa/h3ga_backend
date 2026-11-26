# Formatos institucionales: carga y descarga

Trazabilidad: RF-08 (enlaces), RF-09 (carga PDF/DOC/DOCX), RF-10 (biblioteca y descarga), RF-11 (actualización), RF-12 (eliminación lógica). Fuentes: tabla de requerimientos y diccionario de datos del proyecto.

- `POST /api/gestion/formatos/archivo`: JWT, administrador; multipart `nombre`, `dependencia_id`, `tipo_formato` (`pdf` o `word`), `archivo` y `descripcion` opcional. Rechaza `archivo_path` y `enlace_url`. Límite 10 MiB.
- `GET /api/gestion/formatos/:id/descargar`: JWT, administrador, asesor o auxiliar administrativo; devuelve el contenido para claves del almacenamiento documental. Referencias anteriores incompatibles conservan respuesta 501; enlaces sin archivo responden 400.
- `POST /api/gestion/formatos`: contrato JSON previo, incluidos enlaces, conservado.

El servicio comprueba dependencia activa y nombre disponible; reutiliza el validador documental y añade comprobaciones mínimas de contenido. Almacena con `DocumentStorageService.save` y registra su clave en `formatos_institucionales.archivo_path`; `enlace_url` queda nulo. Se consulta `dependencias_formato` y se inserta en `formatos_institucionales`, con `creado_por` asociado a `usuarios`. No intervienen tablas financieras.

Las comprobaciones de contenido son superficiales: no sustituyen un analizador completo ni garantizan integridad o inocuidad. Si Prisma informa un rechazo de restricciones confirmado, se intenta compensar mediante `remove`. Como `get` oculta errores de acceso como 404, la limpieza no puede confirmarse y se registra como tal. Ante errores de resultado indeterminado se conserva el archivo y se registra el incidente para conciliación manual. No hay proceso automático de conciliación.

Pruebas: `formatos-institucionales.service.spec.ts` (validación, almacenamiento aislado, persistencia simulada, descarga y compensación) y `formatos-institucionales.controller.spec.ts` (JWT, roles y multipart); regresión en `gestion-documental/*.spec.ts`.
