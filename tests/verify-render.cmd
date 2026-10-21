@echo off
setlocal
cd /d "%~dp0.."
if "%TEST_BASE_URL%"=="" (
  echo Configura TEST_BASE_URL con la URL HTTPS real de Render.
  exit /b 1
)
docker compose -f compose.yaml -f compose.test.yaml --profile test build api-tests
if errorlevel 1 exit /b 1
docker compose -f compose.yaml -f compose.test.yaml --profile test run --rm --no-deps -e TEST_BASE_URL -e API_KEY -e TEST_WRITES api-tests npm run test:public
if errorlevel 1 exit /b 1
