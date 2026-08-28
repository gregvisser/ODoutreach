@echo off
REM ============================================================
REM  START THE RELAY  -  just double-click this file.
REM
REM  Twice now the relay failed to start because a fresh
REM  PowerShell window opens in C:\Users\<name> and neither the
REM  script nor the HALT file is there. %~dp0 is this file's own
REM  folder, so this always runs in the right place no matter
REM  where it is launched from.
REM
REM  It also clears a leftover HALT, which is otherwise a silent
REM  reason the relay starts and immediately stops.
REM ============================================================
cd /d "%~dp0"

if exist ".bidlow\relay\HALT" (
  echo Clearing the HALT file left from last time...
  del ".bidlow\relay\HALT"
)

echo Starting the relay. Leave this window open.
echo To stop it: close this window, or create a file called HALT in .bidlow\relay\
echo.

REM ============================================================
REM  THE ROLLOVER LOOP
REM
REM  The watcher bounds itself to a fixed number of cycles per
REM  process - a runaway loop must end itself. It used to end the
REM  WORK too, and Greg had to come and press start again roughly
REM  every sixteen hours, including overnight.
REM
REM  Exit code 42 means only "this process is full, start another".
REM  Every other exit means stop and stay stopped: a HALT file
REM  Greg created, a failed self-test, a crash. So the loop below
REM  is safe - it cannot turn a real stop into an infinite retry.
REM
REM  It cannot spin either: reaching 42 takes forty cycles at
REM  twenty to forty-five minutes each.
REM ============================================================
REM  NOTE ON THE SHAPE BELOW: the rollover is written as LABELS, not as a
REM  parenthesised if-block. Inside a block, cmd expands %VAR% when it PARSES
REM  the block, so the counter would print its old value every single time -
REM  a message that looks right and is always wrong. Out here each line is
REM  expanded as it runs, so the number is real.
set RELAY_GENERATION=1

:relayloop
powershell -ExecutionPolicy Bypass -File "%~dp0relay-watch.ps1"
if errorlevel 43 goto relaystop
if errorlevel 42 goto rollover
goto relaystop

:rollover
set /a RELAY_GENERATION+=1
echo.
echo ------------------------------------------------------------
echo  Cycle budget for this process is used up. Starting a fresh
echo  watcher - generation %RELAY_GENERATION%. Nothing is lost,
echo  nothing needs you. Leave this window open.
echo ------------------------------------------------------------
echo.
goto relayloop

:relaystop
echo.
echo The relay has stopped and will stay stopped. Read the newest file
echo in .bidlow\relay\log\ to see why.
pause
