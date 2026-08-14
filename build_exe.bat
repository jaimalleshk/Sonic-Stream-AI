@echo off
REM ===========================================================================
REM  Build the SonicStream desktop app into a self-contained Windows .exe.
REM  For maintainers - end users just get the finished dist\SonicStream folder.
REM
REM  One-time setup:
REM     pip install -r requirements.txt
REM     pip install pyinstaller
REM  Then just double-click this file (or run it from a terminal).
REM ===========================================================================
setlocal
cd /d "%~dp0"

echo(
echo === SonicStream build ===
echo(

REM Remove any obsolete 'typing' backport that stops PyInstaller from starting.
python -m pip uninstall -y typing >nul 2>&1

echo Cleaning previous build output...
if exist build rmdir /s /q build
if exist dist  rmdir /s /q dist

echo Building SonicStream.exe (this can take a few minutes)...
python -m PyInstaller sonicstream.spec --noconfirm
if errorlevel 1 (
  echo(
  echo *** BUILD FAILED - see the messages above. ***
  exit /b 1
)

echo(
echo === Done ===
echo Your app is here:   dist\SonicStream\SonicStream.exe
echo To share it: zip the whole  dist\SonicStream  folder and send the .zip.
echo(
endlocal
