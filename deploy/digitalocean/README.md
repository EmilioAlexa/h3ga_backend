# Despliegue temporal en DigitalOcean

Guía para Ubuntu 24.04, con NestJS detrás de Nginx y conexiones privadas. No ejecutes migraciones, `db push`, seeds ni comandos que escriban en PostgreSQL durante esta preparación.

## Actualizar sin reemplazar el `.env` existente

El Droplet ya tiene `/opt/h3ga/h3ga_backend/.env` con sus valores reales. **No copies `.env.example` sobre ese archivo ni lo edites durante una actualización.** El ejemplo de este directorio es solo referencia.

En Ubuntu, abre una shell root para que pnpm instalado bajo NVM de root esté disponible:

```bash
cd /opt/h3ga/h3ga_backend
test -f .env
sudo stat -c '%A %U:%G %n' .env
git pull --ff-only
```

Protege el archivo sin leer ni mostrar su contenido. El gestor systemd lee `EnvironmentFile` como root antes de iniciar el proceso como `h3ga`, por lo que puede permanecer `root:root` y modo `600`:

```bash
sudo chown root:root /opt/h3ga/h3ga_backend/.env
sudo chmod 600 /opt/h3ga/h3ga_backend/.env
sudo stat -c '%A %U:%G %n' /opt/h3ga/h3ga_backend/.env
```

No uses `cat`, `less`, `source` ni `systemctl show ... Environment`; pueden revelar secretos. Antes de actualizar, confirma que el archivo esté respaldado de forma segura fuera del repositorio. El comando `git pull --ff-only` no reemplaza archivos ignorados, pero comprueba que `.env` exista antes y verifica sus permisos después.

## Node.js 24 instalado con NVM de root

Abre una shell root con `sudo -i` y mantenla abierta durante los pasos de Node y compilación. Los bloques siguientes se ejecutan dentro de esa shell.

El servicio no puede ejecutar Node desde `/root/.nvm`: `h3ga` no debe acceder al home de root y la unidad usa `ProtectHome=true`. Instala una copia del binario Node 24 en una ruta de sistema legible. Abre una shell de root para que cargue el NVM existente:

```bash
node --version
test "$(node -p 'process.versions.node.split(".")[0]')" = 24
NODE24_SOURCE="$(command -v node)"
install -d -o root -g root -m 755 /opt/h3ga/node24/bin
install -o root -g root -m 755 "$NODE24_SOURCE" /opt/h3ga/node24/bin/node
sudo -u h3ga /opt/h3ga/node24/bin/node --version
```

Si la shell de root no encuentra `node` o la versión no es 24, detente y prepara Node 24 en una ubicación de sistema accesible antes de instalar el servicio. La unidad usa la ruta fija `/opt/h3ga/node24/bin/node`; no presupone que exista `/usr/bin/node` ni accede al NVM de root.

Usa pnpm 11.28.2 disponible en la sesión de despliegue para compilar. Si pnpm está bajo NVM de root, ejecuta los comandos de instalación/build en esa sesión de root; el proceso en ejecución sigue siendo `h3ga`. Los artefactos y `node_modules` deben ser legibles por `h3ga`.

## Dependencias, Prisma y compilación

Ejecuta desde el checkout actualizado:

```bash
cd /opt/h3ga/h3ga_backend
pnpm --version
pnpm install --frozen-lockfile
pnpm exec prisma generate
pnpm build
test -f dist/main.js
```

`pnpm exec prisma generate` genera código local y no conecta ni escribe en PostgreSQL. `dist/main.js` es el punto de entrada generado por Nest CLI con `sourceRoot: src` y `rootDir: src`.

## Usuario de servicio y permisos

Comprueba primero si el usuario existe; crea solo si falta:

```bash
id h3ga || sudo useradd --system --home-dir /opt/h3ga --shell /usr/sbin/nologin h3ga
sudo chown root:h3ga /opt/h3ga
sudo chmod 750 /opt/h3ga
sudo install -d -o h3ga -g h3ga -m 750 /opt/h3ga/h3ga_backend/storage/evidencias
sudo install -d -o h3ga -g h3ga -m 750 /opt/h3ga/h3ga_backend/storage/contratos
```

`ProtectSystem=strict` monta el sistema como solo lectura para el servicio. La unidad permite escrituras solo bajo `/opt/h3ga/h3ga_backend/storage`; crea esas carpetas antes de arrancar. Prisma Client generado, `dist`, `node_modules`, `.env` y el ejecutable Node solo requieren lectura en tiempo de ejecución. No ejecutes un `chown -R` sobre el checkout: revisa archivos existentes individualmente y asegura que `h3ga` pueda leer el build y dependencias.

Guarda el CA descargado de Managed PostgreSQL en `/etc/h3ga/postgresql-ca.crt`. El proceso requiere leer el archivo y atravesar el directorio, sin poder modificarlo:

```bash
sudo install -d -o root -g h3ga -m 750 /etc/h3ga
sudo install -o root -g h3ga -m 640 /RUTA/AL/CA-DESCARGADO.crt /etc/h3ga/postgresql-ca.crt
sudo -u h3ga test -r /etc/h3ga/postgresql-ca.crt
```

Configura la variable `DATABASE_SSL_CA_FILE` ya existente en el `.env` para apuntar a esa ruta; no imprimas el `.env`. La aplicación habilita validación TLS del certificado. Conserva `sslmode=verify-full` y `sslrootcert` en `DATABASE_URL` para las herramientas Prisma que lean la URL.

Actualiza solo esas dos claves dentro del archivo real, sin reemplazarlo:

```bash
sudoedit /opt/h3ga/h3ga_backend/.env
```

```dotenv
DATABASE_SSL_CA_FILE=/etc/h3ga/postgresql-ca.crt
FRONTEND_ORIGIN=https://ORIGEN_REAL.netlify.app
```

El `DATABASE_URL` real también debe usar `sslmode=verify-full` y `sslrootcert` con la ruta de CA escapada correctamente para una URL. La validación de producción requiere esas dos claves. `RESET_CODE_SECRET` y SMTP se validan si se configuran; SMTP debe tener host, puerto, `secure`, usuario, contraseña y remitente para que funcione el correo de recuperación.

## Instalar e iniciar systemd

Revisa la unidad antes de instalarla. Usa una shell de root en el backend; la unidad define usuario, grupo, ruta absoluta de Node, directorio de trabajo y archivo de entorno:

```bash
cd /opt/h3ga/h3ga_backend
sudo install -o root -g root -m 644 deploy/digitalocean/h3ga-api.service /etc/systemd/system/h3ga-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now h3ga-api
sudo systemctl status h3ga-api --no-pager
sudo ss -ltnp | grep '127.0.0.1:3000'
```

El proceso corre como `h3ga`, con `NODE_ENV=production`, `PORT=3000` y bind exclusivo a `127.0.0.1`. `H3GA_LOCAL_INTEGRATION` no debe configurarse en el Droplet.

## Nginx HTTP inicial y Certbot HTTPS

La plantilla contiene un servidor HTTP funcional para la validación inicial de Certbot y el proxy a la API. **Sustituye `REPLACE_WITH_REAL_API_DOMAIN` por el nombre DNS real antes de habilitarla. No actives el archivo con el marcador ni con `api.example.com`.** En el Droplet:

```bash
cd /opt/h3ga/h3ga_backend
sudo install -o root -g root -m 644 deploy/digitalocean/h3ga-api.nginx.conf /etc/nginx/sites-available/h3ga-api
sudoedit /etc/nginx/sites-available/h3ga-api
grep -n 'server_name' /etc/nginx/sites-available/h3ga-api
! grep -q 'REPLACE_WITH_REAL_API_DOMAIN' /etc/nginx/sites-available/h3ga-api
sudo ln -s /etc/nginx/sites-available/h3ga-api /etc/nginx/sites-enabled/h3ga-api
sudo nginx -t
sudo systemctl reload nginx
```

La ubicación `/api/` usa `proxy_pass http://127.0.0.1:3000` sin barra final, por lo que conserva el prefijo. El resto devuelve 404; no se publican carpetas privadas. La API queda temporalmente accesible por HTTP durante la obtención del certificado. Instala Certbot y usa el hostname que acabas de configurar:

```bash
sudo apt update
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d api.DOMINIO_REAL
```

Sustituye `api.DOMINIO_REAL` por el FQDN real. Certbot necesita DNS apuntando al Droplet y acceso al puerto 80. El plugin añade el listener TLS y puede establecer la redirección HTTPS; revisa su configuración resultante para confirmar que conserva `/api/`, el proxy a loopback y el 404 para otras rutas. Configura `client_max_body_size 11m` en el servidor TLS. Las rutas de certificados las administra Certbot; no inventes rutas manualmente.

```bash
sudo nginx -t
sudo systemctl reload nginx
sudo certbot renew --dry-run
```

## Cargas, límites y endpoints comprobados

El backend limita el archivo a 10 MiB (`10485760` bytes para contratos y `MAX_FILE_SIZE_MB=10` para evidencias). Nginx permite un cuerpo de 11 MiB para incluir boundaries y encabezados multipart además del archivo máximo. No aumentes el límite del archivo para compensar el sobrecoste HTTP.

Comprobé en `src/auth/auth.controller.ts` la ruta `GET /api/auth/me` (`@Controller('auth')`, `@Get('me')`) y el prefijo global `/api` en `src/main.ts`. Sin JWT debe responder `401`; con un token válido responde la sesión. No hay una ruta raíz de salud asumida aquí:

```bash
curl -i https://api.DOMINIO_REAL/api/auth/me
```

Usa el dominio real. Flutter Web debe usar `https://api.DOMINIO_REAL`; `FRONTEND_ORIGIN` debe contener exclusivamente el origen HTTPS exacto de Netlify, sin ruta ni slash final. Android usa HTTPS y no depende de CORS del navegador.

## Prueba opcional de Spaces

No ejecutes cargas durante preparación/actualización. Solo al decidir hacer una prueba remota, usa PDF ficticio, pago/contrato de prueba elegible y JWT de pruebas. Estos endpoints están definidos en los controladores reales; crean metadatos y objetos:

```bash
printf '%%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%%%EOF\n' > /tmp/h3ga-spaces-prueba.pdf
export API_TOKEN='JWT_DE_UN_USUARIO_DE_PRUEBAS'
export CONTRACT_ID='UUID_DE_CONTRATO_DE_PRUEBA'
export REQUEST_ID='UUID_DE_SOLICITUD_DE_DOCUMENTO'
export PAYMENT_ID='UUID_DE_PAGO_DE_PRUEBA'
curl -fS -H "Authorization: Bearer $API_TOKEN" -F "solicitud_id=$REQUEST_ID" -F 'file=@/tmp/h3ga-spaces-prueba.pdf;type=application/pdf' "https://api.DOMINIO_REAL/api/finanzas/contratos/$CONTRACT_ID/documentos"
curl -fS -H "Authorization: Bearer $API_TOKEN" -F 'file=@/tmp/h3ga-spaces-prueba.pdf;type=application/pdf' "https://api.DOMINIO_REAL/api/finanzas/pagos/$PAYMENT_ID/evidencias"
```

Los buckets deben seguir privados. Verifica consulta/descarga autorizada y elimina los datos de prueba por los flujos permitidos. No habilites ACL pública ni URLs permanentes.

## Logs y retiro temporal

```bash
sudo journalctl -u h3ga-api -n 100 --no-pager
sudo journalctl -u h3ga-api -f
sudo systemctl stop h3ga-api
sudo systemctl disable h3ga-api
```

Al terminar las pruebas, detén el servicio, deshabilítalo, retira el sitio Nginx y revoca las credenciales temporales. Elimina Droplet, base o Spaces solo después de confirmar qué datos deben conservarse.
