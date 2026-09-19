@echo off
REM 数据中心机柜容量管理平台 - Windows 一键启动
REM 用法: start.bat [docker^|local^|dev^|test^|stop^|clean]
setlocal
set MODE=%1
if "%MODE%"=="" set MODE=docker

if /I "%MODE%"=="docker" (
  docker compose up -d --build
  echo.
  echo ========================================================
  echo   前端: http://localhost:8080   API: http://localhost:3000
  echo ========================================================
  goto :eof
)
if /I "%MODE%"=="stop"  ( docker compose down & goto :eof )
if /I "%MODE%"=="clean" ( docker compose down -v & goto :eof )
if /I "%MODE%"=="test" (
  pushd server
  if not exist node_modules call npm install
  call npm test
  popd
  goto :eof
)
if /I "%MODE%"=="dev" (
  if not exist server\node_modules ( pushd server ^&^& call npm install ^&^& popd )
  if not exist client\node_modules ( pushd client ^&^& call npm install ^&^& popd )
  start "dc-api" cmd /c "cd server ^&^& set DB_MODE=memory^&^& node --watch src/server.js"
  start "dc-web" cmd /c "cd client ^&^& npm run dev"
  echo 开发模式: http://localhost:5173
  goto :eof
)
if /I "%MODE%"=="local" (
  if not exist server\node_modules ( pushd server ^&^& call npm install ^&^& popd )
  if not exist client\node_modules ( pushd client ^&^& call npm install ^&^& popd )
  pushd client ^&^& call npm run build ^&^& popd
  start "dc-api" cmd /c "cd server ^&^& set DB_MODE=memory^&^& node src/server.js"
  start "dc-web" cmd /c "cd client ^&^& npx vite preview --port 8080 --host"
  echo 本机模式: http://localhost:8080
  goto :eof
)
echo 未知模式: %MODE% （支持 docker local dev test stop clean）
