@echo off
title Safety Guardian - Dev Servers
echo.
echo  ================================
echo   Safety Guardian Dev Startup
echo  ================================
echo.
echo  Starting Piper TTS Backend (port 8000)...
start "Piper TTS Backend" cmd /k "cd /d \"%~dp0\" && python -m uvicorn ml_model.main:app --host 127.0.0.1 --port 8000"
echo  Waiting 5 seconds for backend to initialize Piper TTS...
timeout /t 5 /nobreak ^>nul
echo  Starting Vite Frontend (port 3000)...
start "Vite Frontend" cmd /k "cd /d \"%~dp0\" && npm run dev"
echo.
echo  Both servers started!
echo    Frontend : http://localhost:3000
echo    Piper TTS: http://127.0.0.1:8000/tts/health
echo.
