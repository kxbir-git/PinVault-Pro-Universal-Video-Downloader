@echo off
title PinVault Pro - Universal Video Downloader
color 0b
echo ===================================================================
echo               Starting PinVault Pro Full-Stack Server
echo ===================================================================
echo.
cd /d "%~dp0"
node start-dev.js
pause
