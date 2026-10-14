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

# Iniciar servidor en modo desarrollo con Hot Reload
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
Una vez que el servidor esté en ejecución (pnpm run start:dev), puedes acceder a la documentación interactiva de la API navegando a:

URL Local: http://localhost:3000/api/docs

Convenciones de Git y Commits
Para mantener un historial de versión uniforme, se recomienda seguir el estándar de Conventional Commits:

feat: Nueva funcionalidad para el sistema (ej. feat: módulo de evidencias en DigitalOcean).

fix: Corrección de un error o error en el código.

docs: Cambios exclusivamente en la documentación (README.md, comentarios).

refactor: Cambios en el código que no alteran la funcionalidad ni corrigen errores.

test: Adición o modificación de pruebas automatizadas.

