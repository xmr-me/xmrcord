# Builds installer\app.ico (multi-size, PNG-compressed frames) from assets\monero-chan.png.
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$srcPath = Join-Path $here "assets\monero-chan.png"
$outPath = Join-Path $here "app.ico"

$src = [System.Drawing.Image]::FromFile($srcPath)
$sizes = 256, 128, 64, 48, 32, 16
$frames = @()
foreach ($s in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap $s, $s
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.DrawImage($src, 0, 0, $s, $s)
    $g.Dispose()
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    $frames += , ($ms.ToArray())
}
$src.Dispose()

$fs = [System.IO.File]::Create($outPath)
$bw = New-Object System.IO.BinaryWriter $fs
# ICONDIR
$bw.Write([UInt16]0)                    # reserved
$bw.Write([UInt16]1)                    # type = icon
$bw.Write([UInt16]$frames.Count)        # count
$offset = 6 + (16 * $frames.Count)
for ($i = 0; $i -lt $frames.Count; $i++) {
    $sz = $sizes[$i]
    $data = $frames[$i]
    $dim = if ($sz -ge 256) { 0 } else { $sz }   # 0 means 256
    $bw.Write([Byte]$dim)                # width
    $bw.Write([Byte]$dim)                # height
    $bw.Write([Byte]0)                   # color count
    $bw.Write([Byte]0)                   # reserved
    $bw.Write([UInt16]1)                 # planes
    $bw.Write([UInt16]32)                # bpp
    $bw.Write([UInt32]$data.Length)      # bytes in resource
    $bw.Write([UInt32]$offset)           # offset
    $offset += $data.Length
}
foreach ($data in $frames) { $bw.Write($data) }
$bw.Flush(); $bw.Close(); $fs.Close()

Write-Host ("app.ico criado: {0} bytes, {1} frames" -f (Get-Item $outPath).Length, $frames.Count) -ForegroundColor Green
