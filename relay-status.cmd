@echo off
REM Shows what the relay is doing, in plain English, in your browser.
REM Safe to run at any time - it only reads.
cd /d "%~dp0"
node relay-status.mjs || (echo. & echo Could not build the page. Is node installed? & pause & exit /b 1)
start "" "%~dp0relay-status.html"
