@echo off
set JIUZE_PRINTER_NAME=POS-80C
set JIUZE_ALLOWED_ORIGIN=https://jiuze-pos.netlify.app
node "%~dp0server.js"
pause
