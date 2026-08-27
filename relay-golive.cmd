@echo off
REM ============================================================
REM  GO LIVE FOR EVERY CLIENT  -  just double-click this file.
REM
REM  Use this before a client meeting. It does three things, in
REM  this order, and stops without changing anything if any of
REM  them cannot be confirmed:
REM
REM    1. stops the background agent, and waits until it really
REM       has stopped
REM    2. switches scheduled sending on for EVERY client
REM    3. reads that back off the live site to prove it
REM
REM  To put it all back afterwards: relay-resume.cmd
REM
REM  %~dp0 is this file's own folder. A fresh window opens in
REM  C:\Users\<name>, where none of this exists - that has
REM  already cost two failed relay starts.
REM ============================================================
cd /d "%~dp0"

powershell -ExecutionPolicy Bypass -File "%~dp0relay-gate.ps1" -Mode golive

echo.
pause
