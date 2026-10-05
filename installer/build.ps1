# Compiles the Xmrcord installer into a single dependency-free .exe using the in-box
# .NET Framework C# compiler (no Visual Studio / SDK needed).
#
#   powershell -ExecutionPolicy Bypass -File installer\build.ps1
#
# Embeds the Poppins fonts (installer\fonts\*.ttf) and Monero-chan (installer\assets\monero-chan.png)
# as resources, and sets installer\app.ico as the exe icon.
# Output: installer\XmrcordInstaller.exe

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

$fx  = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319"
$csc = Join-Path $fx "csc.exe"
if (-not (Test-Path $csc)) { throw "csc.exe não encontrado em $fx (precisa do .NET Framework 4.x)." }

# Regenerate the exe icon from the png if missing
$ico = Join-Path $here "app.ico"
if (-not (Test-Path $ico)) {
    & "$PSHOME\powershell.exe" -ExecutionPolicy Bypass -File (Join-Path $here "makeicon.ps1")
}

$refs = @(
    "$fx\WPF\PresentationFramework.dll",
    "$fx\WPF\PresentationCore.dll",
    "$fx\WPF\WindowsBase.dll",
    "$fx\System.Xaml.dll",
    "$fx\System.dll",
    "$fx\System.Core.dll",
    "$fx\System.Xml.dll",
    "$fx\System.Drawing.dll"
)
foreach ($r in $refs) { if (-not (Test-Path $r)) { throw "Referência ausente: $r" } }

# Embedded resources: fonts + mascot png. Logical name = file name (what the code looks up).
$resources = @()
foreach ($ttf in (Get-ChildItem (Join-Path $here "fonts") -Filter *.ttf)) {
    $resources += "/resource:$($ttf.FullName),$($ttf.Name)"
}
$png = Join-Path $here "assets\monero-chan.png"
if (-not (Test-Path $png)) { throw "Faltando: $png" }
$resources += "/resource:$png,monero-chan.png"

$out = Join-Path $here "XmrcordInstaller.exe"
$src = Join-Path $here "Program.cs"
$refArgs = $refs | ForEach-Object { "/reference:$_" }

Write-Host "Compilando XmrcordInstaller.exe..." -ForegroundColor Cyan
& $csc /nologo /target:winexe /platform:anycpu /optimize+ "/win32icon:$ico" "/out:$out" $refArgs $resources $src

if ($LASTEXITCODE -ne 0) { throw "Falha na compilação (csc saiu com $LASTEXITCODE)." }
Write-Host "OK -> $out" -ForegroundColor Green
Get-Item $out | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize
