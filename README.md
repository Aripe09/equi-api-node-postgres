# EquiAPI

API REST de gestión de caballos con Node.js puro, el módulo nativo `http` y PostgreSQL. No utiliza Express ni ningún framework web. `pg` es la única dependencia directa; sus dependencias transitivas están fijadas en `package-lock.json`.

## Estado de implementación

Etapas 1 y 2 verificadas por el usuario: contenedores `equi-postgres` y `equi-api` saludables, PostgreSQL persistente con 10 caballos, consulta de Zafiro mediante `/api/caballos/3` y pruebas de integración CRUD exitosas. Etapa 3 completada: [repositorio público en GitHub](https://github.com/Aripe09/equi-api-node-postgres), rama `main`, archivos remotos comprobados y `.env` excluido. Render y n8n aún no están desplegados.

## Objetivo y tecnologías

Gestionar información de caballos mediante endpoints JSON, conservando los datos en PostgreSQL y ejecutando la aplicación y la base en Docker. Tecnologías: Node.js 24, HTTP nativo, JavaScript ESM, `pg`, PostgreSQL 17.11, Docker Compose y `node:test`. La API protege las escrituras mediante una API key configurable.

## PostgreSQL en Docker

Requisitos: Docker Desktop iniciado en modo de contenedores Linux y Docker Compose. No se requiere instalar PostgreSQL, Node.js ni npm en Windows.

La imagen oficial fijada es `postgres:17.11-bookworm`. Docker Compose descarga la imagen si falta y crea automáticamente:

- Contenedor `equi-postgres`.
- Base `equi_db` y usuario definido en `.env`.
- Volumen `equi_postgres_data`, montado en `/var/lib/postgresql/data`, con PGDATA en su subdirectorio `pgdata`.
- Red bridge `equi_network`; otros servicios usarán `postgres:5432` como destino.
- Tabla `caballos`, índices, restricciones y 10 registros ficticios mediante `database/init.sql`.

La contraseña local está en `.env`, excluido de Git. `.env.example` solo contiene valores de ejemplo. En esta etapa la API reutiliza las credenciales locales existentes sin crear usuarios ni modificar el esquema. `POSTGRES_USER` corresponde al administrador inicial; para un futuro entorno de producción se deberá provisionar un rol de aplicación con permisos limitados.

Desde esta carpeta:

```powershell
docker compose config --quiet
docker compose up -d --wait --wait-timeout 120
docker images postgres:17.11-bookworm
docker ps --filter name=equi-postgres
docker volume ls --filter name=equi_postgres_data
docker network inspect equi_network
docker compose logs postgres
docker compose exec -T postgres psql -U equi_admin -d equi_db -c "SELECT current_database();"
docker compose exec -T postgres psql -U equi_admin -d equi_db -c "SELECT * FROM caballos ORDER BY id;"
docker compose exec -T postgres psql -U equi_admin -d equi_db -c "SELECT count(*) FROM caballos;"
```

Si modificas el usuario en `.env`, sustituye `equi_admin` en estos comandos. PostgreSQL solo se publica en `127.0.0.1:5433`; puedes cambiar `POSTGRES_PORT` si está ocupado. El puerto interno permanece en `5432`: la API y los demás servicios de la red Docker se conectarán a `postgres:5432`, sin usar el puerto de Windows ni `localhost`.

## Validaciones

Nombre y raza no pueden estar vacíos. Edad entera de 0 a 60 años. Sexo: `Macho` o `Hembra`. Estado: `Activo`, `Inactivo`, `En tratamiento` o `Retirado`. Campos opcionales permiten NULL, pero no cadenas vacías. Estado y fecha tienen valores por defecto.

## Persistencia

Para ejecutar todas las comprobaciones, incluido comparar el contenido completo antes y después de reiniciar y recrear el contenedor:

```powershell
powershell -ExecutionPolicy Bypass -File .\tests\verify-postgres.ps1
```

Esta prueba espera los 10 registros iniciales y no elimina datos. Está diseñada para la etapa 1, antes de las pruebas CRUD.

`database/init.sql` se ejecuta únicamente cuando el volumen está vacío. Los reinicios no vuelven a insertar las semillas. Cambiar `.env` no cambia credenciales de un clúster ya inicializado.

```powershell
docker compose restart postgres
docker compose up -d --wait --wait-timeout 120
docker compose exec -T postgres psql -U equi_admin -d equi_db -c "SELECT count(*) FROM caballos;"
docker compose stop
docker compose start
```

No ejecutar `docker compose down -v` ni eliminar el volumen. `docker compose down` sin `-v` conserva los datos. Los cambios posteriores del esquema se aplicarán con migraciones, sin recrear el volumen.

## Problemas encontrados

Windows impidió publicar el puerto 5432, según la ejecución del usuario. Se cambió el valor predeterminado de Compose y `POSTGRES_PORT` en `.env` y `.env.example` a 5433. Este cambio conserva el volumen `equi_postgres_data`, PGDATA y el puerto interno 5432; no borra ni modifica los datos.

Se verificó con `docker compose config --format json` que el mapeo efectivo es `127.0.0.1:5433` hacia `5432`. Se corrigió la función `Invoke-Docker` del script para conservar los argumentos nativos en Windows PowerShell 5.1.

El primer intento de `docker version` detectó el cliente instalado y Compose v5.5.1, pero el acceso al motor `dockerDesktopLinuxEngine` devolvió `permission denied` dentro de esta sesión. Posteriormente el usuario confirmó la verificación satisfactoria de PostgreSQL desde su terminal.

`docker compose config --quiet` y la configuración combinada con `compose.test.yaml` se validaron correctamente. En la sesión de desarrollo el motor Docker rechazó el acceso. Las comprobaciones posteriores de la API y las pruebas de integración CRUD se ejecutaron correctamente desde la terminal del usuario, según su confirmación. Esta distinción conserva la procedencia de la verificación.

## Etapas siguientes

4. Render y PostgreSQL remoto independiente, con inicialización controlada.
5. n8n en Docker y workflows HTTP importables.

Cada etapa queda condicionada a verificar la anterior. GitHub no sincroniza datos de PostgreSQL entre entornos.

## Arquitectura de la API

```text
Windows: localhost:3000 -> contenedor api (Node.js http, puerto 3000)
                              |
                              +-> postgres:5432 -> equi_db -> caballos
Windows: localhost:5433 -> contenedor postgres:5432 -> equi_postgres_data
```

`src/server.js` configura el pool y el cierre ordenado. `src/app.js` crea el servidor HTTP. Las rutas, controladores, validación y repositorio SQL se encuentran en carpetas separadas. Todas las consultas con datos del cliente usan parámetros `$1`, `$2`, etc. El pool tiene límites de conexiones y tiempos de espera. Los errores no exponen SQL ni secretos.

El arranque local de la API no crea bases, tablas, usuarios ni semillas; comprueba la tabla `caballos` existente. El contenedor de la API espera el healthcheck de PostgreSQL. La imagen de Node se construye con `npm ci`; Node.js y npm solo son necesarios dentro de Docker. La aplicación se ejecuta como usuario `node`, con sistema de archivos de solo lectura, sin capacidades Linux y escucha en `0.0.0.0` usando `process.env.PORT` (3000 por defecto). En Render, `RUN_MIGRATIONS=true` habilita migraciones versionadas exclusivamente sobre una `DATABASE_URL` explicita.

## Variables de entorno

| Variable | Uso |
| --- | --- |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` | Credenciales existentes de PostgreSQL en `.env` |
| `POSTGRES_PORT` | Puerto de Windows, actualmente `5433`; no cambia el puerto interno |
| `API_KEY` | Secreto de al menos 32 bytes para escritura; enviado como `X-API-Key` |
| `CORS_ORIGINS` | Orígenes separados por comas; por defecto `http://localhost:3000,http://localhost:5678` |
| `PGHOST`, `PGPORT`, `PGDATABASE` | Compose fija `postgres`, `5432`, `equi_db` para la API |
| `PGUSER`, `PGPASSWORD` | Compose los toma de las credenciales existentes |
| `PORT` | Puerto del proceso Node; Compose lo fija en `3000` |

La instalación original conserva una API key aleatoria en `.env`, sin cambiar las credenciales PostgreSQL. No publicar este archivo. Para una copia nueva, copia `.env.example` a `.env` y reemplaza los valores de ejemplo por secretos propios antes del primer arranque. No sobrescribas el `.env` de una instalación existente. CORS permite clientes sin cabecera Origin, como CMD y servicios Docker; para navegadores verifica la lista configurada. Una lista vacía rechaza orígenes de navegador. `*` permite cualquier origen sin credenciales de navegador y solo debe usarse si se desea expresamente. CORS no sustituye la API key.

## Endpoints

Todas las rutas aceptan una barra final opcional. ID, raza y estado deben indicarse en la URL; PUT y DELETE requieren un ID y no operan sobre toda la colección.

| Método | Ruta | Respuesta |
| --- | --- | --- |
| GET | `/api/health` | 200 y estado de PostgreSQL; 503 si falla la conexión |
| GET | `/api/caballos` | 200 y arreglo ordenado por ID |
| GET | `/api/caballos/:id` | 200 y caballo; 404 si no existe |
| GET | `/api/caballos/raza/:raza` | 200 y arreglo, filtro exacto sin distinguir mayúsculas |
| GET | `/api/caballos/estado/:estado` | 200 y arreglo, filtro exacto sin distinguir mayúsculas |
| POST | `/api/caballos` | 201, caballo creado y cabecera Location; exige API key |
| PUT | `/api/caballos/:id` | 200 y caballo actualizado; exige API key |
| DELETE | `/api/caballos/:id` | 200 y confirmación JSON; exige API key |
| OPTIONS | Cualquier ruta válida | 200 y métodos permitidos; admite preflight CORS |

PUT reemplaza los campos editables: exige nombre, raza, edad y sexo. Los opcionales omitidos se guardan como NULL y estado omitido pasa a `Activo`. No modifica ID ni fecha de registro. No es un PATCH parcial.

POST y PUT requieren `Content-Type: application/json`; límite de cuerpo: 16 KiB. Se rechazan campos desconocidos, JSON malformado, valores vacíos y tipos incorrectos. Códigos de error: 400 datos/ID inválidos, 401 API key ausente o incorrecta, 403 origen/cabecera CORS no permitido, 404 ruta/registro inexistente, 405 método no permitido, 413 cuerpo grande, 415 tipo de contenido no permitido y 503 servicio de datos no disponible. Todas las respuestas de la aplicación son JSON.

Ejemplo de cuerpo de creación o reemplazo:

```json
{
  "nombre": "Caballo de prueba",
  "raza": "Cuarto de Milla",
  "edad": 5,
  "sexo": "Macho",
  "color": "Alazán",
  "disciplina": "Charrería",
  "propietario": "Rancho de prueba",
  "estado": "Activo"
}
```

## Ejecutar desde CMD sin instalar Node.js

```bat
cd /d "RUTA\A\equi-api"
docker compose config --quiet
docker compose up -d --build --wait --wait-timeout 180
docker compose ps
docker compose logs --tail 100 api
curl.exe --fail http://localhost:3000/api/health
curl.exe --fail http://localhost:3000/api/caballos
curl.exe --fail http://localhost:3000/api/caballos/6
curl.exe --fail "http://localhost:3000/api/caballos/raza/Cuarto%20de%20Milla"
curl.exe --fail http://localhost:3000/api/caballos/estado/Activo
```

Al escribir directamente en CMD usa `%20` en la URL de raza; dentro de un archivo `.cmd` se escribe `%%20`.

Si el puerto 3000 está ocupado, detener el servicio que lo ocupa o cambiar solo el lado izquierdo del mapeo y la URL de las pruebas. Para errores de contraseña, comprobar que `.env` conserva los valores de la inicialización original; cambiar el archivo no cambia la contraseña almacenada en PostgreSQL.

## Pruebas automatizadas

Desde CMD se pueden ejecutar todas las pruebas con:

```bat
test-local.cmd
```

El archivo detiene la secuencia ante cualquier fallo y realiza:

1. Construcción y arranque con healthchecks.
2. Construcción del contenedor de pruebas.
3. Suite `node:test` con HTTP real y repositorio simulado: CRUD, filtros, validación, API key, CORS, métodos, límites y consultas parametrizadas.
4. Suite `node:test` de integración contra la API y PostgreSQL reales: comprueba POST, PUT y DELETE directamente en SQL y compara los registros originales antes/después.
5. Script PowerShell desde Windows: consulta los endpoints, comprueba autenticación, inserta un caballo temporal, verifica SQL, actualiza, reinicia PostgreSQL y API, comprueba persistencia y elimina exclusivamente su registro temporal.

Comandos separados para diagnosticar:

```bat
docker compose -f compose.yaml -f compose.test.yaml --profile test build api-tests
docker compose -f compose.yaml -f compose.test.yaml --profile test run --rm --no-deps api-tests npm test
docker compose -f compose.yaml -f compose.test.yaml --profile test run --rm --no-deps api-tests npm run test:integration
powershell -NoProfile -ExecutionPolicy Bypass -File tests\verify-api.ps1
```

Ejecutar las pruebas sin escrituras concurrentes de otros clientes: comparan todos los registros originales. Las inserciones de prueba consumen valores de la secuencia SERIAL incluso después de borrar sus registros; no reinician la secuencia ni reutilizan IDs. Nunca eliminan los 10 caballos iniciales.

Las pruebas integradas y el script intentan limpiar únicamente registros con una marca aleatoria propia si ocurre un fallo. Si Docker o la API quedan inaccesibles durante la limpieza, puede permanecer un registro con prefijo `EquiAPI-test-`; no se elimina ningún registro ajeno para corregirlo.

## Verificación de esta entrega

Se validaron el JSON de paquetes, la sintaxis PowerShell y las configuraciones Compose normal y de pruebas. `package-lock.json` contiene versiones e integridades del registro público de npm. `npm ci`, el servidor y las pruebas Node se ejecutan dentro de Docker. No se requiere instalar Node.js, npm ni PostgreSQL en Windows.

El usuario confirmó que la API local responde con los datos de PostgreSQL, que ambos contenedores están saludables y que las pruebas de integración CRUD fueron exitosas. También confirmó la persistencia de PostgreSQL en la etapa 1. Para repetir la verificación completa, ejecutar `test-local.cmd`; el script incluye pruebas de persistencia de la API tras reiniciar.

## Publicación en GitHub

Repositorio publicado: [Aripe09/equi-api-node-postgres](https://github.com/Aripe09/equi-api-node-postgres), rama `main`. Se incluyen el Dockerfile, ambos Compose, el esquema y las semillas ficticias, código Node.js, pruebas y documentación. Los registros reales del volumen PostgreSQL no se almacenan en Git ni se sincronizan al publicar el código.

`.gitignore` excluye `.env`, variantes de entorno (excepto `.env.example`), claves privadas, carpetas de credenciales, dependencias, respaldos, bases locales y temporales. `.dockerignore` también excluye esos archivos del contexto de construcción.

Comandos de publicación, ejecutados desde la carpeta del proyecto después de revisar los archivos:

```bat
git init -b main
git add .
git diff --cached --stat
git check-ignore .env
git commit -m "Initial commit: EquiAPI with native Node.js HTTP and PostgreSQL"
gh auth status
gh repo create equi-api-node-postgres --public --source=. --remote=origin --push
git ls-remote origin refs/heads/main
```

En equipos nuevos, `gh auth login --hostname github.com --git-protocol https --web` permite autenticar GitHub CLI mediante el navegador. No pegar tokens en comandos, archivos del proyecto ni mensajes.

Para clonar en una carpeta nueva:

```bat
git clone https://github.com/Aripe09/equi-api-node-postgres.git
cd equi-api-node-postgres
copy .env.example .env
notepad .env
docker compose up -d --build --wait --wait-timeout 180
```

Antes de arrancar, sustituir los secretos de ejemplo en el editor. Estos comandos de copia son para instalaciones nuevas; conservar `.env` y el volumen en la instalación actual.

## Siguiente etapa: Render

La publicación en GitHub está verificada. La [guia de Render](docs/RENDER.md) describe el Blueprint `render.yaml`, PostgreSQL remoto, variables, planes y pasos del panel. Ya se implementaron `DATABASE_URL`, TLS y migraciones transaccionales con historial y semillas una sola vez. Sin `DATABASE_URL`, la conexion local conserva `postgres:5432` y las credenciales `PG*`. Los recursos de Render aun requieren autorizacion y creacion: no se afirma que exista una URL publica funcionando.

La inicialización remota debe ser controlada y ejecutarse una sola vez mediante migraciones. No se debe ejecutar `database/init.sql` indiscriminadamente en cada despliegue ni conectar Render a `postgres:5432` de la red local. La base local seguirá intacta; cualquier sincronización de datos entre entornos requiere una decisión explícita. Render y n8n permanecen pendientes.
