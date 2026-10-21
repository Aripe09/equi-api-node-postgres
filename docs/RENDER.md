# Preparación de la etapa 4: Render

Estado: GitHub publicado y verificado. No hay un servicio Render creado, una base remota provisionada ni una URL pública de la API comprobada. Este documento prepara la siguiente etapa; no confirma un despliegue.

## Fuente y servicio previsto

Repositorio: https://github.com/Aripe09/equi-api-node-postgres

| Configuración | Valor previsto |
| --- | --- |
| Tipo de servicio | Web Service |
| Entorno | Node.js 24, HTTP nativo sin frameworks |
| Rama | `main` |
| Directorio raíz | Raíz del repositorio |
| Construcción | `npm ci --omit=dev --ignore-scripts` |
| Inicio | `npm start`, después de completar la inicialización remota controlada |
| Healthcheck | `/api/health` |
| Puerto | Valor de `process.env.PORT` asignado por Render |
| Interfaz | `0.0.0.0`, ya implementada |
| Despliegue automático | Desde los commits de `main` |

Antes de crear recursos se debe conectar la cuenta Render con GitHub y conceder acceso a este repositorio. La elección de plan y región se hará en la etapa 4 con las opciones disponibles en la cuenta; este documento no contrata servicios.

## PostgreSQL remoto

Se utilizará una instancia Render Postgres independiente de Docker. La base y la API deben quedar en la misma región y cuenta para usar la URL interna. Las conexiones externas de Render Postgres requieren TLS; las internas admiten TLS con certificados autofirmados. La configuración SSL se elegirá según la URL real y no se desactivará globalmente la verificación TLS de Node.js. Consultar [conexiones de Render Postgres](https://render.com/docs/postgresql-creating-connecting).

La API remota no debe utilizar `postgres:5432` ni `localhost:5433`: esos destinos corresponden a la instalación local. GitHub transporta código, no el contenido de `equi_postgres_data`.

## Variables previstas

| Variable | Origen y tratamiento |
| --- | --- |
| `DATABASE_URL` | URL interna del PostgreSQL remoto; guardar como secreto en Render |
| `API_KEY` | Generar un secreto de al menos 32 bytes, independiente del secreto local |
| `CORS_ORIGINS` | Lista explícita de los clientes que consumirán la API desde navegadores |
| `NODE_ENV` | `production` |
| `PORT` | Proporcionada por Render, no fijarla al puerto de Windows |

No publicar valores reales en GitHub, documentación, logs ni `render.yaml`.

## Trabajo de implementación pendiente

1. Extender `src/config/database.js` para aceptar `DATABASE_URL`, conservando las variables `PG*` de Docker cuando no exista esa URL. Configurar SSL explícitamente según el tipo de conexión.
2. Crear migraciones versionadas con registro de las versiones aplicadas, transacciones y exclusión de ejecuciones simultáneas. Una migración ya aplicada no se repite.
3. Inicializar el esquema y las semillas ficticias exclusivamente en una base remota nueva. Si ya existe una tabla con datos, validar su estructura y detenerse ante incompatibilidades; no truncar, reiniciar secuencias ni duplicar semillas.
4. Elegir la ejecución de migraciones apropiada al plan de Render. El inicio de la API solo debe continuar después de que el esquema esté listo.
5. Añadir `render.yaml` con referencias a secretos y a la base provisionada, sin credenciales literales. Validar el Blueprint antes de desplegar, según la [referencia oficial](https://render.com/docs/blueprint-spec).
6. Probar los cambios en un entorno de prueba separado. No ejecutar migraciones sobre la base local existente durante esta preparación.

El `database/init.sql` actual es para la primera inicialización del contenedor Docker. No es un mecanismo idempotente de despliegue y no se debe ejecutar en cada reinicio de la API remota.

## Criterios para confirmar el despliegue

- Render completa la construcción e inicia el proceso sin errores de conexión.
- La URL real asignada responde en `/api/health` y devuelve conexión PostgreSQL correcta.
- `/api/caballos` y `/api/caballos/6` leen desde la instancia remota.
- POST, PUT y DELETE requieren API key y se prueban con un registro temporal propio.
- Un nuevo despliegue conserva los datos y no duplica las semillas.
- La rama y el commit desplegados coinciden con `main` en GitHub.

La URL pública se documentará únicamente después de crear y comprobar el servicio. No se configurará sincronización entre las bases local y remota sin una autorización específica. n8n se abordará después de verificar Render.
