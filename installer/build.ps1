# Compiles the Xmrcord installer into a single dependency-free .exe using the in-box
# .NET Framework C# compiler (no Visual Studio / SDK needed).
#
#   powershell -ExecutionPolicy Bypass -File installer\build.ps1
#
# Output: installer\XmrcordInstaller.exe

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

$fx  = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319"
$csc = Join-Path $fx "csc.exe"
if (-not (Test-Path $csc)) { throw "csc.exe não encontrado em $fx (precisa do .NET Framework 4.x)." }

$refs = @(
    "$fx\WPF\PresentationFramework.dll",
    "$fx\WPF\PresentationCore.dll",
    "$fx\WPF\WindowsBase.dll",
    "$fx\System.Xaml.dll",
    "$fx\System.dll",
    "$fx\System.Core.dll",
    "$fx\System.Xml.dll"
)
foreach ($r in $refs) { if (-not (Test-Path $r)) { throw "Referência ausente: $r" } }

$out = Join-Path $here "XmrcordInstaller.exe"
$src = Join-Path $here "Program.cs"

$refArgs = $refs | ForEach-Object { "/reference:$_" }

Write-Host "Compilando XmrcordInstaller.exe..." -ForegroundColor Cyan
& $csc /nologo /target:winexe /platform:anycpu /optimize+ "/out:$out" $refArgs $src

if ($LASTEXITCODE -ne 0) { throw "Falha na compilação (csc saiu com $LASTEXITCODE)." }
Write-Host "OK -> $out" -ForegroundColor Green
Get-Item $out | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize
