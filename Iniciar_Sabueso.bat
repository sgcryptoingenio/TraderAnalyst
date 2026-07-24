@echo off
setlocal enabledelayedexpansion
title Sabueso - Launcher y Diagnostico
color 0B

echo ===================================================
echo             SABUESO TRADING SCANNER
echo          Herramienta de Arranque (DevOps)
echo ===================================================
echo.

:: Cambiar al directorio exacto donde esta este script
cd /d "%~dp0"

echo [1/4] Verificando dependencias del Backend (Python)...
if not exist "backend\venv\Scripts\activate.bat" (
    echo [ALERTA] Entorno virtual no encontrado. Creando venv e instalando dependencias...
    cd backend
    python -m venv venv
    call venv\Scripts\activate.bat
    pip install -r requirements.txt
    cd ..
) else (
    echo [OK] Entorno virtual Python detectado.
)

echo.
echo [2/4] Verificando dependencias del Frontend (Node.js)...
if not exist "frontend\node_modules" (
    echo [ALERTA] node_modules no encontrado. Instalando dependencias de npm...
    cd frontend
    call npm install
    cd ..
) else (
    echo [OK] Dependencias Node.js detectadas.
)

echo.
echo [3/4] Iniciando el Servidor de Inteligencia y Datos (Backend)...
start "Sabueso - Servidor Backend" cmd /k "cd backend && call venv\Scripts\activate.bat && python main.py"

echo [4/4] Iniciando la Interfaz Visual (Frontend)...
start "Sabueso - Servidor Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo Esperando a que los servicios arranquen...
timeout /t 5 /nobreak >nul

echo.
echo Abriendo plataforma en el navegador...
start http://localhost:5173

echo.
echo ===================================================
echo [EXITO] Sabueso esta corriendo en las ventanas abiertas.
echo Para apagar la plataforma, cierra las ventanas de consola (CMD) del Backend y Frontend.
echo ===================================================
echo.
echo Esta ventana se cerrara en 5 segundos...
timeout /t 5 >nul
exit
