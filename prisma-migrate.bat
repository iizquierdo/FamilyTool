@echo off
setlocal
cd /d "%~dp0"
echo Applying Prisma migrations: npx prisma migrate deploy
call npx prisma migrate deploy
if errorlevel 1 (
  echo.
  echo Prisma migrate deploy failed. See messages above.
  exit /b 1
)
echo.
echo Done. All pending migrations are applied.
pause
exit /b 0

