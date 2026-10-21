@echo off
setlocal
cd /d "%~dp0"
docker compose config --quiet
if errorlevel 1 exit /b 1
docker compose up -d --build --wait --wait-timeout 180
if errorlevel 1 exit /b 1
docker compose -f compose.yaml -f compose.test.yaml --profile test build api-tests
if errorlevel 1 exit /b 1
docker compose -f compose.yaml -f compose.test.yaml --profile test run --rm --no-deps api-tests npm test
if errorlevel 1 exit /b 1
docker compose -f compose.yaml -f compose.test.yaml --profile test run --rm --no-deps api-tests npm run test:integration
if errorlevel 1 exit /b 1
powershell -NoProfile -ExecutionPolicy Bypass -File tests\verify-api.ps1
if errorlevel 1 exit /b 1
docker compose ps
curl.exe --fail http://localhost:3000/api/health
if errorlevel 1 exit /b 1
echo.
echo Todas las pruebas locales finalizaron correctamente.
