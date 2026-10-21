$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

function Invoke-Docker {
    # Sin enlace de parametros: conserva flags Docker como -d y --wait en PowerShell 5.1.
    $DockerArgs = $args
    $result = & docker @DockerArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Docker fallo: $($DockerArgs[0]). Codigo: $LASTEXITCODE"
    }
    return $result
}

if (-not (Test-Path .env)) { throw 'Falta .env. Copia .env.example y configura una contrasena.' }
$userLine = Get-Content .env | Where-Object { $_ -match '^POSTGRES_USER=' } | Select-Object -First 1
if (-not $userLine) { throw 'Falta POSTGRES_USER en .env.' }
$databaseUser = $userLine.Substring('POSTGRES_USER='.Length).Trim()

function Invoke-Sql {
    param([string]$Sql)
    Invoke-Docker compose exec -T postgres psql -X -v ON_ERROR_STOP=1 -U $databaseUser -d equi_db -At -c $Sql
}

Invoke-Docker compose config --quiet
Invoke-Docker compose up -d --wait --wait-timeout 120 postgres
Invoke-Docker images postgres:17.11-bookworm
Invoke-Docker image inspect postgres:17.11-bookworm --format '{{.Id}}'
Invoke-Docker ps --filter name=equi-postgres
$containerState = Invoke-Docker inspect equi-postgres --format '{{.State.Status}}'
if ($containerState -ne 'running') { throw "Estado inesperado: $containerState" }
$health = Invoke-Docker inspect equi-postgres --format '{{.State.Health.Status}}'
if ($health -ne 'healthy') { throw "Healthcheck inesperado: $health" }
Invoke-Docker volume ls --filter name=equi_postgres_data
Invoke-Docker volume inspect equi_postgres_data --format '{{.Name}}'
Invoke-Docker network inspect equi_network --format '{{.Name}}'
Invoke-Docker compose logs --tail 80 postgres

$databaseName = Invoke-Sql 'SELECT current_database();'
if ($databaseName -ne 'equi_db') { throw 'Base de datos incorrecta.' }
Invoke-Sql 'SELECT * FROM caballos ORDER BY id;'
$count = Invoke-Sql 'SELECT count(*) FROM caballos;'
if ([int]$count -ne 10) { throw "Primera inicializacion: se esperaban 10 registros; encontrados: $count. No se eliminara ningun dato." }
$breedCount = Invoke-Sql 'SELECT count(DISTINCT raza) FROM caballos;'
if ([int]$breedCount -ne 10) { throw 'Se esperaban 10 razas diferentes.' }

# Compara todas las columnas, incluida la fecha, para detectar reinicializaciones.
$fingerprintSql = 'SELECT md5(string_agg(row_to_json(c)::text, chr(10) ORDER BY id)) FROM caballos c;'
$before = Invoke-Sql $fingerprintSql
Invoke-Docker compose restart postgres
Invoke-Docker compose up -d --wait --wait-timeout 120 postgres
$after = Invoke-Sql $fingerprintSql
if ($before -ne $after) { throw 'El contenido cambio tras reiniciar.' }

# Recrear el contenedor debe conservar el mismo volumen y contenido.
Invoke-Docker compose up -d --force-recreate --wait --wait-timeout 120 postgres
$afterRecreate = Invoke-Sql $fingerprintSql
if ($before -ne $afterRecreate) { throw 'El contenido cambio tras recrear el contenedor.' }
Invoke-Sql 'SELECT count(*) AS total_despues_de_recrear FROM caballos;'
Write-Output 'ETAPA 1 VERIFICADA: imagen, contenedor saludable, volumen, red, base, 10 caballos y persistencia al reiniciar y recrear.'
