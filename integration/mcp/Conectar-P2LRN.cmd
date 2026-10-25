@echo off
setlocal EnableExtensions
set "ROOT=%~dp0..\.."
pushd "%ROOT%" || goto :failed

where node >nul 2>nul
if errorlevel 1 (
  echo P2LRN requiere Node.js 22 o superior. Instala Node.js LTS antes de conectar una IA.
  goto :failed
)

node -e "if(Number(process.versions.node.split('.')[0])<22)process.exit(1)"
if errorlevel 1 (
  echo P2LRN requiere Node.js 22 o superior.
  goto :failed
)

if /i "%~1"=="--help" (
  node integration\mcp\connect-local.mjs --help
  if errorlevel 1 goto :failed
  popd
  exit /b 0
)

if not exist "packages\toolkit\dist\authoring\index.js" (
  echo Preparando Toolkit P2LRN...
  pushd "packages\toolkit"
  call npm install --ignore-scripts --no-audit --no-fund
  if errorlevel 1 goto :failed_subdir
  call npm run build
  if errorlevel 1 goto :failed_subdir
  popd
)

if not exist "integration\mcp\node_modules\@modelcontextprotocol\client" (
  echo Instalando integracion MCP opcional...
  pushd "integration\mcp"
  call npm install --ignore-scripts --no-audit --no-fund
  if errorlevel 1 goto :failed_subdir
  popd
)

if "%~1"=="" (
  node integration\mcp\connect-local.mjs --wizard
) else (
  node integration\mcp\connect-local.mjs %*
)
set "RESULT=%ERRORLEVEL%"
if not "%RESULT%"=="0" goto :failed
echo.
echo Configuracion finalizada.
pause
popd
exit /b 0

:failed_subdir
popd
:failed
echo No se han podido completar todos los pasos. Revisa el error anterior.
pause
popd
exit /b 1
