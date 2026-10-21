param([string]$BaseUrl = 'http://localhost:3000')
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$BaseUrl = $BaseUrl.TrimEnd('/')
$envLines = Get-Content .env
$keyLine = $envLines | Where-Object { $_ -match '^API_KEY=' } | Select-Object -First 1
$userLine = $envLines | Where-Object { $_ -match '^POSTGRES_USER=' } | Select-Object -First 1
if (-not $keyLine -or -not $userLine) { throw 'Falta API_KEY o POSTGRES_USER en .env.' }
$apiKey = $keyLine.Substring('API_KEY='.Length).Trim()
$databaseUser = $userLine.Substring('POSTGRES_USER='.Length).Trim()

function Invoke-Docker {
    $dockerArgs = $args
    $output = & docker @dockerArgs
    if ($LASTEXITCODE -ne 0) { throw "Fallo Docker: $($dockerArgs[0])" }
    return $output
}
function Invoke-Sql {
    param([string]$Sql)
    Invoke-Docker compose exec -T postgres psql -X -v ON_ERROR_STOP=1 -U $databaseUser -d equi_db -At -c $Sql
}
function Invoke-Api {
    param([string]$Method, [string]$Path, $Body = $null, [int]$Expected = 200, [switch]$WithoutKey)
    $headers = @{}
    if (-not $WithoutKey) { $headers['X-API-Key'] = $apiKey }
    $parameters = @{ Uri = "$BaseUrl$Path"; Method = $Method; Headers = $headers; UseBasicParsing = $true; TimeoutSec = 20 }
    if ($null -ne $Body) {
        $parameters.ContentType = 'application/json; charset=utf-8'
        $parameters.Body = [System.Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Compress))
    }
    try { $result = Invoke-WebRequest @parameters; $status = [int]$result.StatusCode }
    catch {
        if (-not $_.Exception.Response) { throw }
        $status = [int]$_.Exception.Response.StatusCode
        if ($status -ne $Expected) { throw "HTTP $status en $Method $Path; esperado $Expected" }
        return
    }
    if ($status -ne $Expected) { throw "HTTP $status en $Method $Path; esperado $Expected" }
    return ($result.Content | ConvertFrom-Json)
}

Invoke-Docker compose up -d --build --wait --wait-timeout 180
$health = Invoke-Api GET '/api/health'
if ($health.database -ne 'ok') { throw 'PostgreSQL no disponible desde la API.' }
$before = @(Invoke-Api GET '/api/caballos')
if ($before.Count -lt 10) { throw 'Se esperaban al menos los 10 registros iniciales.' }
$originalJson = $before | ConvertTo-Json -Depth 10 -Compress
$horseSix = Invoke-Api GET '/api/caballos/6'
if ($horseSix.id -ne 6) { throw 'No se encontro el caballo 6.' }
$withSlash = @(Invoke-Api GET '/api/caballos/')
if ($withSlash.Count -ne $before.Count) { throw 'La ruta con barra final difiere.' }
Invoke-Api GET '/api/caballos/estado/Activo' | Out-Null
$breedUrl = [Uri]::EscapeDataString($horseSix.raza)
Invoke-Api GET "/api/caballos/raza/$breedUrl" | Out-Null
Invoke-Api POST '/api/caballos' -Expected 401 -WithoutKey
Invoke-Api PUT '/api/caballos/6' -Expected 401 -WithoutKey
Invoke-Api DELETE '/api/caballos/6' -Expected 401 -WithoutKey
Invoke-Api GET '/api/caballos/0' -Expected 400
$marker = 'EquiAPI-test-' + [Guid]::NewGuid().ToString('N')
$payload = @{ nombre=$marker; raza='Cuarto de Milla'; edad=4; sexo='Macho'; color='Alazan'; disciplina='Prueba'; propietario='Prueba automatizada'; estado='Activo' }
$createdId = $null
try {
    $created = Invoke-Api POST '/api/caballos' -Body $payload -Expected 201
    $createdId = [int]$created.id
    if ($createdId -le 0 -or $created.nombre -ne $marker) { throw 'POST no devolvio el registro creado.' }
    $storedName = Invoke-Sql "SELECT nombre FROM caballos WHERE id = $createdId;"
    if ($storedName -ne $marker) { throw 'El POST no se reflejo en PostgreSQL.' }
    $payload.edad = 5
    Invoke-Api PUT "/api/caballos/$createdId/" -Body $payload | Out-Null
    $storedAge = Invoke-Sql "SELECT edad FROM caballos WHERE id = $createdId;"
    if ([int]$storedAge -ne 5) { throw 'El PUT no se reflejo en PostgreSQL.' }
    $payload.edad = -1
    Invoke-Api POST '/api/caballos' -Body $payload -Expected 400
    $payload.edad = 5

    # Reinicia sin eliminar volumen ni datos, incluido el caballo temporal.
    Invoke-Docker compose restart postgres api
    Invoke-Docker compose up -d --wait --wait-timeout 180
    $persisted = Invoke-Api GET "/api/caballos/$createdId"
    if ($persisted.nombre -ne $marker -or $persisted.edad -ne 5) { throw 'Fallo la persistencia tras reiniciar.' }
    Invoke-Api DELETE "/api/caballos/$createdId/" | Out-Null
    $remaining = Invoke-Sql "SELECT count(*) FROM caballos WHERE id = $createdId;"
    if ([int]$remaining -ne 0) { throw 'El DELETE no se reflejo en PostgreSQL.' }
    Invoke-Api GET "/api/caballos/$createdId" -Expected 404
    Invoke-Api DELETE "/api/caballos/$createdId" -Expected 404
    $createdId = $null
} finally {
    # Limpia exclusivamente registros con la marca unica de esta ejecucion.
    $temporary = @(Invoke-Api GET '/api/caballos') | Where-Object { $_.nombre -eq $marker }
    foreach ($record in $temporary) { Invoke-Api DELETE ("/api/caballos/" + $record.id) | Out-Null }
}
$after = @(Invoke-Api GET '/api/caballos')
if (($after | ConvertTo-Json -Depth 10 -Compress) -ne $originalJson) { throw 'Los registros originales cambiaron.' }
Write-Output 'ETAPA 2 VERIFICADA: HTTP, CRUD, API key, PostgreSQL real y persistencia; registros originales intactos.'
