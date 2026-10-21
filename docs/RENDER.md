# Preparación de la etapa 4: Render

Estado: adaptacion implementada con `DATABASE_URL`, TLS, migraciones versionadas y `render.yaml`. No hay aun un servicio EquiAPI Render creado ni una URL pública comprobada. La creacion de recursos espera la autorizacion del usuario sobre los planes.

## Fuente y servicio previsto

Repositorio: https://github.com/Aripe09/equi-api-node-postgres

| Configuración | Valor previsto |
| --- | --- |
| Tipo de servicio | Web Service |
| Entorno | Node.js 24, HTTP nativo sin frameworks |
| Rama | `main` |
| Directorio raíz | Raíz del repositorio |
| Construcción | `npm ci --omit=dev --ignore-scripts && npm test` |
| Inicio | `npm start`; migra antes de escuchar cuando `RUN_MIGRATIONS=true` |
| Healthcheck | `/api/health` |
| Puerto | Valor de `process.env.PORT` asignado por Render |
| Interfaz | `0.0.0.0`, ya implementada |
| Despliegue automático | `checksPass`: desde `main` cuando pasan los controles CI |

Antes de crear recursos se debe conectar la cuenta Render con GitHub y conceder acceso a este repositorio. La elección de plan y región se hará en la etapa 4 con las opciones disponibles en la cuenta; este documento no contrata servicios.

## PostgreSQL remoto

Se utilizará una instancia Render Postgres independiente de Docker. La base y la API deben quedar en la misma región y cuenta para usar la URL interna. Las conexiones externas de Render Postgres requieren TLS; las internas admiten TLS con certificados autofirmados. La configuración SSL se elegirá según la URL real y no se desactivará globalmente la verificación TLS de Node.js. Consultar [conexiones de Render Postgres](https://render.com/docs/postgresql-creating-connecting).

La API remota no debe utilizar `postgres:5432` ni `localhost:5433`: esos destinos corresponden a la instalación local. GitHub transporta código, no el contenido de `equi_postgres_data`. El Blueprint deshabilita el acceso externo a la base (`ipAllowList: []`).

## Variables previstas

| Variable | Origen y tratamiento |
| --- | --- |
| `DATABASE_URL` | URL interna del PostgreSQL remoto; guardar como secreto en Render |
| `API_KEY` | Generar un secreto de al menos 32 bytes, independiente del secreto local |
| `CORS_ORIGINS` | Lista explícita de los clientes que consumirán la API desde navegadores |
| `NODE_ENV` | `production` |
| `PORT` | Proporcionada por Render, no fijarla al puerto de Windows |
| `RUN_MIGRATIONS` | `true` en Render; ausente/false localmente |
| `DATABASE_SSL_MODE` | `require` para TLS con certificados autofirmados de la red interna Render; `verify-full` por defecto para otras URLs |

No publicar valores reales en GitHub, documentación, logs ni `render.yaml`.

## Implementacion y seguridad de las migraciones

`src/config/connectionOptions.js` da prioridad a `DATABASE_URL`; sin esa variable conserva `PG*` y los valores `postgres:5432/equi_db` de Docker. TLS verifica certificados por defecto. La excepcion explicita `require` cifra la conexion sin validar la CA y se utiliza solo para el certificado autofirmado de la URL interna Render. No se modifica `NODE_TLS_REJECT_UNAUTHORIZED`.

`src/database/migrate.js` ejecuta `database/migrations/001-caballos.sql` en una transaccion, con bloqueo asesor para serializar arranques y checksum SHA-256 en `equi_schema_migrations`. Los siguientes arranques solo comprueban el historial y omiten las migraciones aplicadas. Cambiar un archivo aplicado produce error: los cambios futuros requieren una nueva version.

Las 10 semillas se insertan dentro de esa primera transaccion, solo si no existe `caballos`. Si existe una tabla sin historial, la migracion se detiene y revierte, sin adoptar ni modificar sus datos automaticamente. No se utilizan DROP, TRUNCATE ni reinicios de secuencia en migraciones.

El servidor ejecuta migraciones unicamente con `RUN_MIGRATIONS=true` y exige una `DATABASE_URL` explicita. Compose local no transmite ninguna de esas variables. `compose.yaml`, `database/init.sql` y el volumen existente permanecen intactos. No se requieren comandos previos al despliegue que dependan de un plan de pago: `npm start` realiza la comprobacion antes de abrir el puerto.

`render.yaml` contiene un servicio Node y un PostgreSQL 17 en Virginia, ambos con `plan: free`, referencia segura `fromDatabase` y API key generada por Render. No crea nada hasta importar y confirmar el Blueprint. Debe revisarse en el panel contra la [referencia oficial](https://render.com/docs/blueprint-spec).

## Planes y autorizacion

El Blueprint propone Free para pruebas: PostgreSQL tiene 1 GB y vence a los 30 dias; la API puede suspenderse por inactividad. No es una base gratuita permanente. Ver [limitaciones oficiales](https://render.com/docs/free).

Para persistencia remota sin esa caducidad se requiere PostgreSQL de pago; el panel muestra compute desde US$6/mes mas almacenamiento. El precio final depende del almacenamiento y del plan web elegido. Se solicitara autorizacion antes de crear o contratar servicios, incluso cuando se elija Free, y se comprobara el resumen del panel. No se cambia el plan de otros servicios del usuario.

## Pasos en el panel despues de autorizar

1. Iniciar sesion en https://dashboard.render.com.
2. Elegir **New > Blueprint** y conectar GitHub si se solicita. Al instalar la app Render, seleccionar solo `Aripe09/equi-api-node-postgres` si se desea limitar el acceso.
3. Seleccionar ese repositorio, rama `main` y archivo `render.yaml`. Si no aparece, abrir **Configure GitHub** y permitir el repositorio.
4. Revisar ambos recursos: `equi-api` y `equi-postgres-remote`, Virginia, planes autorizados. No confirmar si el panel muestra un costo no autorizado.
5. En `CORS_ORIGINS` indicar los clientes de navegador permitidos; `http://localhost:3000,http://localhost:5678` sirve para pruebas. Las peticiones sin Origin y la navegacion directa funcionan igualmente.
6. Confirmar la creacion solo tras la autorizacion. Render obtiene `DATABASE_URL` de su base y genera `API_KEY`; no copiar la clave local ni publicarla.
7. Esperar PostgreSQL Available y servicio Live. Revisar logs de migraciones y el healthcheck. Guardar la URL HTTPS real que muestra el servicio.

## Pruebas

`npm test` contiene 13 pruebas de HTTP nativo, configuracion local/remota, API key, CORS y transacciones de migraciones. Se ejecutaron con el runtime ya existente en el equipo, sin instalar Node ni npm y sin conectar a la base local. GitHub Actions repite las pruebas en Docker con Node 24, ejecuta el CRUD PostgreSQL real y comprueba migraciones concurrentes e idempotentes sobre un PostgreSQL desechable. Ese servicio utiliza tmpfs, no publica puertos y no monta `equi_postgres_data`.

Para comprobar migraciones desde CMD en un entorno aislado, sin tocar la base existente:

```bat
docker compose -f compose.yaml -f compose.test.yaml --profile test build api-tests
docker compose -f compose.yaml -f compose.test.yaml -f compose.migration-test.yaml --profile test up -d --wait migration-postgres
docker compose -f compose.yaml -f compose.test.yaml -f compose.migration-test.yaml --profile test run --rm --no-deps api-tests npm run test:migrations
```

Pruebas publicas desde CMD, despues de conocer la URL real:

```bat
set TEST_BASE_URL=URL_HTTPS_REAL_ASIGNADA_POR_RENDER
set TEST_WRITES=false
tests\verify-render.cmd
```

Para CRUD, establecer `TEST_WRITES=true` y proporcionar `API_KEY` remota en el entorno del proceso de prueba, sin publicarla. El script `scripts/verify-public.js` verifica autenticacion y crea, actualiza y elimina solo un caballo con nombre aleatorio propio. Compara los registros originales antes y despues. No ejecutar escrituras concurrentes durante esa comparacion.

El `database/init.sql` actual es para la primera inicialización del contenedor Docker. No es un mecanismo idempotente de despliegue y no se debe ejecutar en cada reinicio de la API remota.

## Criterios para confirmar el despliegue

- Render completa la construcción e inicia el proceso sin errores de conexión.
- La URL real asignada responde en `/api/health` y devuelve conexión PostgreSQL correcta.
- `/api/caballos` y `/api/caballos/6` leen desde la instancia remota.
- POST, PUT y DELETE requieren API key y se prueban con un registro temporal propio.
- Un nuevo despliegue conserva los datos y no duplica las semillas.
- La rama y el commit desplegados coinciden con `main` en GitHub.

La URL pública se documentará únicamente después de crear y comprobar el servicio. No se configurará sincronización entre las bases local y remota sin una autorización específica. n8n se abordará después de verificar Render.
