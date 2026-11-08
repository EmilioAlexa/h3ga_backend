# H3GA Backend

Backend principal para la plataforma H3GA, desarrollado con NestJS y orientado a la gestión de procesos administrativos, operativos y financieros de la organización.

El proyecto está diseñado bajo una arquitectura modular, con separación de responsabilidades y una estructura preparada para incorporar progresivamente los diferentes procesos del sistema.

## Tecnologías principales

- **Node.js** — Entorno de ejecución.
- **NestJS** — Framework para el desarrollo del backend.
- **TypeScript** — Lenguaje principal de desarrollo.
- **pnpm** — Administrador de paquetes.
- **PostgreSQL** — Sistema gestor de base de datos relacional.
- **Prisma** — ORM para la interacción con la base de datos.
- **Jest** — Framework para pruebas automatizadas.
- **Swagger / OpenAPI** — Documentación de la API.
- **Git** — Control de versiones.

## Arquitectura

El backend utiliza una arquitectura modular basada en dominios funcionales.
Cada módulo encapsula sus propias responsabilidades y permite mantener una separación clara entre las diferentes áreas del sistema.

La estructura general del proyecto es:

```text
src/
│
├── auth/
├── usuarios/
├── roles/
├── clientes/
│
├── ruta/
│
├── finanzas/
│
├── database/
│
├── config/
│
├── common/
│
├── app.module.ts
└── main.ts

Estructura de la aplicación
El flujo general de las operaciones seguirá una separación de responsabilidades similar a:

Cliente
   │
   ▼
Controller
   │
   ▼
DTO / Validación
   │
   ▼
Service
   │
   ▼
Persistencia
   │
   ▼
Prisma
   │
   ▼
PostgreSQL

Variables de entorno
Las configuraciones sensibles no deben almacenarse directamente en el repositorio.
El proyecto utilizará archivos de variables de entorno para datos como:

DATABASE_URL

JWT_SECRET

PORT

El archivo .env será utilizado únicamente en los entornos correspondientes y no deberá incorporarse al control de versiones.
Se mantendrá un archivo .env.example como referencia para las variables necesarias.

Comandos de Ejecución
# Instalar las dependencias del proyecto
pnpm install --frozen-lockfile

# Generar Prisma Client, una vez configurado el esquema
pnpm exec prisma generate

# Aplicar las migraciones existentes en la base local
pnpm exec prisma migrate deploy

# Iniciar NestJS en desarrollo
pnpm run start:dev

# Compilar proyecto para producción
pnpm run build

# Iniciar servidor en modo producción
pnpm run start:prod

Pruebas Automatizadas

# Ejecutar pruebas unitarias
pnpm test

# Ejecutar pruebas e2e (End-to-End)
pnpm test:e2e

# Generar cobertura de código
pnpm test:cov

Documentación API (Swagger)
Swagger está deshabilitado por defecto. Para habilitarlo en un entorno autorizado, configura `SWAGGER_ENABLED=true` en el archivo `.env` y ejecuta `pnpm run start:dev`.

- Interfaz interactiva: `http://localhost:3000/api/docs`
- Documento OpenAPI JSON: `http://localhost:3000/api/docs-json`

En producción, deja `SWAGGER_ENABLED=false` salvo que se haya autorizado explícitamente publicar la documentación. Para probar rutas protegidas, inicia sesión en `POST /api/auth/login`, copia `access_token` y úsalo en el botón **Authorize** con el esquema Bearer JWT. Swagger documenta los guards y permisos existentes; no los omite.

La documentación es parte de cada entrega: los controladores deben declarar etiquetas, propósito, seguridad, roles y respuestas; los DTO deben describir campos y validaciones; los endpoints de retiro deben explicar si desactivan o eliminan. No documentes rutas futuras antes de implementarlas. El Plan Maestro mantiene esta regla para las etapas 10.2–10.10.

Convenciones de Git y Commits
Para mantener un historial de versión uniforme, se recomienda seguir el estándar de Conventional Commits:

feat: Nueva funcionalidad para el sistema (ej. feat: módulo de evidencias en DigitalOcean).

fix: Corrección de un error o error en el código.

docs: Cambios exclusivamente en la documentación (README.md, comentarios).

refactor: Cambios en el código que no alteran la funcionalidad ni corrigen errores.

test: Adición o modificación de pruebas automatizadas.

---

# Flujo de trabajo con Prisma ORM

Esta sección establece el procedimiento que deben seguir todos los integrantes del equipo para trabajar con **Prisma ORM y PostgreSQL** dentro del proyecto H3GA Backend.

El objetivo es mantener sincronizados:

- El esquema de Prisma (`schema.prisma`).
- Las migraciones de la base de datos.
- La base de datos PostgreSQL local.
- El código del backend NestJS.
- Los cambios compartidos mediante Git y GitHub.

**Regla principal:** ningún integrante debe modificar directamente la estructura de la base de datos sin reflejar y compartir esos cambios mediante las migraciones de Prisma.

---

## 1. Arquitectura de base de datos

El proyecto utiliza una sola base de datos PostgreSQL para H3GA Ruta y H3GA Finanzas.

La conexión se administra mediante Prisma ORM.

Archivos principales:

```text
h3ga_backend/
├── prisma/
│   ├── migrations/
│   │   ├── 0_init/
│   │   ├── 20261023174300_add_password_hash/
│   │   ├── 20261103130000_sync_current_schema/
│   │   └── migration_lock.toml
│   └── schema.prisma
│
├── prisma.config.ts
├── src/
│   ├── database/
│   │   └── prisma.service.ts
│   ├── auth/
│   ├── usuarios/
│   ├── roles/
│   ├── clientes/
│   ├── ruta/
│   └── finanzas/
│
├── .env
├── .env.example
└── package.json
```

### Responsabilidad de cada archivo

| Archivo | Responsabilidad |
|---|---|
| `schema.prisma` | Define los modelos, campos, relaciones, índices y restricciones. |
| `migrations/` | Conserva el historial de cambios de estructura de PostgreSQL. |
| `migration_lock.toml` | Identifica el proveedor de base de datos utilizado. |
| `prisma.config.ts` | Configura Prisma CLI y las conexiones necesarias. |
| `prisma.service.ts` | Administra la conexión de Prisma desde NestJS. |
| `.env` | Contiene las variables de conexión locales. |
| `.env.example` | Documenta las variables necesarias sin incluir credenciales reales. |

**Importante:** el equipo debe utilizar el mismo `schema.prisma`, el mismo historial de migraciones y las mismas versiones de dependencias.

---

## 2. Configuración inicial del proyecto

Cuando un integrante clone el repositorio por primera vez, debe ejecutar:

```bash
git clone URL_DEL_REPOSITORIO
cd h3ga_backend

pnpm install
```

Después debe configurar su archivo `.env` utilizando `.env.example` como referencia.

Cada integrante utilizará sus propias credenciales locales, pero deberá respetar la configuración de PostgreSQL y el nombre de la base de datos establecido para desarrollo.

Una vez configurada la conexión, debe ejecutar:

```bash
pnpm exec prisma generate
```

Este comando genera el cliente de Prisma a partir del esquema definido en `schema.prisma`.

Para consultar el estado de las migraciones:

```bash
pnpm exec prisma migrate status
```

Si la base de datos local está vacía, se deben aplicar las migraciones existentes:

```bash
pnpm exec prisma migrate deploy
```

Este comando aplica las migraciones pendientes sin crear nuevas migraciones.

**No se debe ejecutar `migrate reset` para preparar el entorno de un compañero.**

---

## 3. Flujo normal de trabajo con Prisma

Cada vez que se necesite modificar la estructura de la base de datos, se debe seguir esta secuencia:

### Paso 1. Actualizar la rama de trabajo

Antes de comenzar cualquier modificación:

```bash
git checkout main
git pull origin main
```

Crear una rama para trabajar en la funcionalidad:

```bash
git checkout -b feat/nombre-funcionalidad
```

Ejemplos:

```bash
git checkout -b feat/finanzas-pagos
git checkout -b feat/finanzas-contratos
git checkout -b feat/finanzas-comisiones
```

### Paso 2. Modificar `schema.prisma`

Agregar o modificar los modelos, campos, relaciones, índices o enumeraciones correspondientes.

Ejemplo:

```prisma
model formas_pago {
  id          Int      @id @default(autoincrement())
  nombre      String   @unique
  descripcion String?
  activo      Boolean  @default(true)

  pagos       pagos[]
}
```

Antes de continuar, verificar que el esquema sea válido:

```bash
pnpm exec prisma validate
```

### Paso 3. Crear una migración

Cuando el esquema esté validado, generar una migración:

```bash
pnpm exec prisma migrate dev --name nombre_del_cambio
```

Ejemplo:

```bash
pnpm exec prisma migrate dev --name crear_formas_pago
```

Este comando:

1. Compara el esquema de Prisma con el historial de migraciones.
2. Genera el SQL correspondiente.
3. Crea una nueva carpeta dentro de `prisma/migrations/`.
4. Aplica la migración a la base de datos local.
5. Actualiza el estado de las migraciones.

**Cada cambio estructural debe generar su propia migración.**

No se deben modificar migraciones anteriores que ya hayan sido compartidas o aplicadas en otros entornos.

### Paso 4. Generar el cliente de Prisma

Después de modificar el esquema:

```bash
pnpm exec prisma generate
```

Esto actualiza el cliente generado que utiliza el backend NestJS.

### Paso 5. Implementar el código del backend

Una vez actualizada la estructura de datos, se puede implementar la lógica correspondiente:

- Módulos.
- Controladores.
- Servicios.
- DTO.
- Validaciones.
- Relaciones mediante Prisma.
- Pruebas unitarias y e2e.

Los módulos deben utilizar el `PrismaService` existente.

No se debe crear una nueva instancia de `PrismaClient` dentro de cada servicio.

### Paso 6. Verificar los cambios

Antes de compartir los cambios:

```bash
pnpm exec prisma validate
pnpm exec prisma generate
pnpm exec tsc --noEmit
pnpm test -- --runInBand
pnpm run test:e2e -- --runInBand
pnpm exec prisma migrate status
```

Si alguna prueba falla, debe corregirse antes de crear el Pull Request.

---

## 4. Cómo compartir los cambios con el equipo

Cuando una persona termina una modificación de Prisma, debe compartir tanto el esquema como su migración.

Ejemplo:

```text
prisma/
├── schema.prisma
└── migrations/
    ├── 0_init/
    ├── 20261023174300_add_password_hash/
    ├── 20261103130000_sync_current_schema/
    └── 20261105120000_crear_formas_pago/
        └── migration.sql
```

Revisar los archivos modificados:

```bash
git status
git diff
```

Agregar los archivos correspondientes:

```bash
git add prisma/schema.prisma
git add prisma/migrations/
git add src/
```

Crear el commit:

```bash
git commit -m "feat(finanzas): agregar catalogo de formas de pago"
```

Subir la rama:

```bash
git push -u origin feat/finanzas-pagos
```

Después, crear un **Pull Request en GitHub** para revisión y aprobación.

El resto del equipo debe esperar a que el Pull Request sea aprobado y fusionado antes de incorporar los cambios.

---

## 5. Cómo debe actualizarse otro integrante

Cuando un compañero haya fusionado una nueva migración en `main`, los demás integrantes deben ejecutar:

```bash
git checkout main
git pull origin main
```

Instalar dependencias si cambió `package.json` o `pnpm-lock.yaml`:

```bash
pnpm install
```

Aplicar las migraciones pendientes en su base local:

```bash
pnpm exec prisma migrate deploy
```

Generar el cliente actualizado:

```bash
pnpm exec prisma generate
```

Validar:

```bash
pnpm exec prisma migrate status
pnpm exec prisma validate
```

De esta manera, cada integrante tendrá la misma estructura de base de datos sin tener que recrearla manualmente.

---

## 6. Comandos principales de Prisma

| Comando | Uso |
|---|---|
| `pnpm exec prisma validate` | Comprueba que el esquema sea válido. |
| `pnpm exec prisma generate` | Genera el cliente de Prisma. |
| `pnpm exec prisma migrate status` | Consulta el estado de las migraciones. |
| `pnpm exec prisma migrate dev --name nombre` | Crea y aplica una migración durante el desarrollo. |
| `pnpm exec prisma migrate deploy` | Aplica migraciones existentes pendientes. |
| `pnpm exec prisma db pull` | Introspecciona la base de datos y actualiza el esquema Prisma. |
| `pnpm exec prisma studio` | Abre una interfaz para consultar y editar registros. |
| `pnpm exec prisma migrate diff` | Compara estructuras y genera diferencias SQL. |

### Diferencia entre los comandos de migración

**`migrate dev`:** se utiliza para crear nuevas migraciones durante el desarrollo, normalmente por el integrante responsable del cambio estructural.

**`migrate deploy`:** se utiliza para aplicar migraciones que ya existen en el repositorio. Es el procedimiento habitual para que los demás integrantes actualicen su base local.

**`db pull`:** se utiliza para sincronizar el esquema de Prisma a partir de una base de datos existente. No crea migraciones y puede sobrescribir cambios manuales de `schema.prisma`. No debe utilizarse como procedimiento habitual de sincronización del equipo.

---

## 7. Reglas importantes para evitar errores

Todos los integrantes deben respetar estas reglas:

1. No modificar directamente la estructura de PostgreSQL sin documentar el cambio en una migración.
2. No eliminar ni editar migraciones que ya hayan sido compartidas o aplicadas.
3. No utilizar `prisma migrate reset` en la base de datos compartida o en una base con información que deba conservarse.
4. No utilizar `prisma db push` como mecanismo habitual de sincronización.
5. No ejecutar `prisma migrate dev` sobre una base con diferencias estructurales no investigadas.
6. No modificar manualmente la carpeta `src/generated/prisma`; es código generado.
7. No crear múltiples instancias de `PrismaClient`.
8. No subir archivos `.env`, contraseñas, credenciales ni cadenas de conexión reales a GitHub.
9. No compartir migraciones sin probarlas y revisarlas.
10. No fusionar cambios de Prisma sin revisar posibles conflictos en `schema.prisma` y las migraciones.
11. No utilizar `migrate resolve` para ocultar diferencias o marcar migraciones como aplicadas sin verificar previamente la estructura real de la base de datos.
12. Toda modificación estructural debe acompañarse de su migración y de la actualización correspondiente del código.

---

## 8. ¿Qué hacer si dos integrantes modifican Prisma al mismo tiempo?

Para evitar conflictos:

1. Cada integrante debe trabajar en su propia rama.
2. Antes de crear una migración, debe actualizar su rama con los cambios recientes de `main`.
3. Si otro integrante ya modificó `schema.prisma`, primero se deben integrar sus cambios.
4. Revisar manualmente los modelos, relaciones, nombres de campos e índices.
5. Resolver los conflictos de `schema.prisma`.
6. Crear una migración nueva que represente el estado final combinado.
7. Revisar el SQL generado antes de aplicarlo.
8. Ejecutar las pruebas correspondientes.
9. Compartir los cambios mediante un Pull Request.

**Nunca se deben fusionar dos migraciones con el mismo nombre ni modificar el historial para ocultar conflictos.**

Si hay dudas sobre el estado de la base de datos, detener el proceso y revisar el historial de migraciones antes de ejecutar comandos que modifiquen su estructura.

---

## 9. Procedimiento de revisión antes de fusionar un Pull Request

Todo Pull Request que modifique Prisma debe incluir:

- [ ] Actualización de `schema.prisma`.
- [ ] Nueva migración dentro de `prisma/migrations/`, si hubo cambios estructurales.
- [ ] SQL de migración revisado.
- [ ] `pnpm exec prisma validate` aprobado.
- [ ] `pnpm exec prisma generate` ejecutado.
- [ ] `pnpm exec tsc --noEmit` aprobado.
- [ ] Pruebas unitarias aprobadas.
- [ ] Pruebas e2e aprobadas cuando correspondan.
- [ ] `pnpm exec prisma migrate status` revisado.
- [ ] Descripción de los cambios y su impacto sobre otras tablas.
- [ ] Confirmación de que no se modificaron migraciones anteriores.

---

## 10. Flujo resumido del equipo

```text
ACTUALIZAR RAMA MAIN
        |
        v
CREAR RAMA DE FUNCIONALIDAD
        |
        v
MODIFICAR schema.prisma
        |
        v
VALIDAR ESQUEMA
        |
        v
CREAR MIGRACIÓN CON migrate dev
        |
        v
REVISAR SQL GENERADO
        |
        v
GENERAR CLIENTE PRISMA
        |
        v
IMPLEMENTAR SERVICIOS Y CONTROLADORES
        |
        v
EJECUTAR PRUEBAS
        |
        v
CREAR COMMIT Y SUBIR RAMA
        |
        v
PULL REQUEST Y REVISIÓN
        |
        v
FUSIONAR EN MAIN
        |
        v
LOS DEMÁS INTEGRANTES ACTUALIZAN
        |
        v
APLICAR MIGRACIONES CON migrate deploy
        |
        v
GENERAR CLIENTE Y VALIDAR
```

---

## 11. Regla final del proyecto

La base de datos de H3GA debe evolucionar de forma controlada.

**GitHub es el medio oficial para compartir los cambios del código, el esquema de Prisma y el historial de migraciones.**

Ningún integrante debe depender de cambios realizados únicamente en su computadora o en su base de datos local.

Si una modificación afecta la estructura de PostgreSQL, debe existir una migración correspondiente, revisada y compartida mediante GitHub.

De esta manera, todos los integrantes podrán trabajar con la misma estructura de datos y mantener la integridad de H3GA Ruta y H3GA Finanzas.

**El historial de migraciones es la referencia compartida para reconstruir y actualizar la estructura de la base de datos.**


