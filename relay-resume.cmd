@echo off
REM ============================================================
REM  PUT THE SAFETY RAIL BACK  -  just double-click this file.
REM
REM  The other half of relay-golive.cmd. It does three things,
REM  in this order:
REM
REM    1. switches the safety rail back on
REM    2. reads that back off the live site to prove it
REM    3. only then starts the background agent again
REM
REM  If step 2 cannot be confirmed the agent is NOT started -
REM  an agent must never run without a confirmed rail.
REM
REM  Safe to run even if you are not sure whether you went live.
REM ============================================================
cd /d "%~dp0"

powershell -ExecutionPolicy Bypass -File "%~dp0relay-gate.ps1" -Mode resume

echo.
pause
