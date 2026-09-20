# auto.ps1 - makes everything in assets/auto/. Run it after adding, replacing or deleting
#            pictures, video clips or poster PDFs. The originals are never changed.
#
#   .\_tools\auto.ps1          # makes what is missing or older than its original
#   .\_tools\auto.ps1 -Force   # remakes everything
#
# What it writes (never edit these by hand; deleting assets/auto/ and running this again is safe):
#
#   assets/<journal|project|conference>/img/<CODE>/<name>.png|jpg|...
#       -> assets/auto/img/<CODE>/<name>.jpg          fast copy, 480 px tall
#   assets/<...>/img/<CODE>/<name>.mp4|webm
#       -> assets/auto/img/<CODE>/<name>.mp4 + .jpg   light silent copy (360 px tall) and a still
#   assets/conference/<CODE>_..._POSTER[_V2].pdf      (the newest version wins)
#       -> assets/auto/poster/<CODE>.jpg              large, for the viewer (long side 2000 px)
#       -> assets/auto/poster/<CODE>_s.jpg            small, for the thumbnail (360 px wide)
#
# The page shows a copy when one exists and the original otherwise, and a click always opens
# the original - so forgetting to run this breaks nothing; pages just load more slowly.
# Small pictures get no copy. Copies whose original is gone are removed.
#
# Video copies need ffmpeg. It is looked for on PATH, in miniconda/anaconda environments and in
# C:\ffmpeg\bin; give the path with -Ffmpeg otherwise. Without it the page plays the originals.
param([switch]$Force, [int]$Height = 480, [int]$VideoHeight = 360, [int]$VideoCrf = 32, [string]$Ffmpeg = "")

# The PDF renderer used for posters exists only in Windows PowerShell 5.1: hand over to it when started from PowerShell 7.
if ($PSVersionTable.PSEdition -eq 'Core') {
  $a = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath, '-Height', $Height, '-VideoHeight', $VideoHeight, '-VideoCrf', $VideoCrf)
  if ($Force) { $a += '-Force' }
  if ($Ffmpeg) { $a += @('-Ffmpeg', $Ffmpeg) }
  & "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" @a
  exit $LASTEXITCODE
}

Add-Type -AssemblyName System.Drawing
$site = Split-Path $PSScriptRoot
$auto = Join-Path $site "assets\auto"
$pics = '^\.(png|jpe?g|gif|bmp)$'
$vids = '^\.(mp4|webm|mov|m4v)$'
$jpeg = [Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }

function Save-Jpeg($img, [int]$w, [int]$h, [string]$path, [long]$quality) {
  $bmp = New-Object Drawing.Bitmap $w, $h
  $g = [Drawing.Graphics]::FromImage($bmp); $g.Clear([Drawing.Color]::White)
  $g.InterpolationMode = 'HighQualityBicubic'; $g.PixelOffsetMode = 'HighQuality'
  $g.DrawImage($img, 0, 0, $w, $h)
  $p = New-Object Drawing.Imaging.EncoderParameters 1
  $p.Param[0] = New-Object Drawing.Imaging.EncoderParameter ([Drawing.Imaging.Encoder]::Quality), $quality
  $bmp.Save($path, $jpeg, $p); $g.Dispose(); $bmp.Dispose()
}

# True when the copy is missing, older than its original, or -Force was given.
function Test-Stale($file, [string]$copy) {
  if ($Force -or -not (Test-Path -LiteralPath $copy)) { return $true }
  return (Get-Item -LiteralPath $copy).LastWriteTimeUtc -lt $file.LastWriteTimeUtc
}

if (-not $Ffmpeg) {
  $cmd = Get-Command ffmpeg -ErrorAction SilentlyContinue
  if ($cmd) { $Ffmpeg = $cmd.Source }
  else {
    $found = @("$env:USERPROFILE\miniconda3", "$env:USERPROFILE\anaconda3", "C:\ProgramData\miniconda3", "C:\ProgramData\anaconda3") |
      Where-Object { Test-Path $_ } |
      ForEach-Object { Get-ChildItem -Path (Join-Path $_ "Library\bin\ffmpeg.exe"), (Join-Path $_ "envs\*\Library\bin\ffmpeg.exe") -ErrorAction SilentlyContinue }
    $found = @($found) + @(Get-Item "C:\ffmpeg\bin\ffmpeg.exe" -ErrorAction SilentlyContinue) | Where-Object { $_ }
    if ($found) { $Ffmpeg = @($found)[0].FullName }
  }
}

# ---------------------------------------------------------------- 1. pictures and clips of the entries
# A picture no larger than 150 KB and 600 px tall is used as it is. Returns the copy's name, or $null.
function Save-Picture($file, [string]$outDir) {
  $name = $file.BaseName + ".jpg"; $t = Join-Path $outDir $name
  try { $im = [Drawing.Image]::FromFile($file.FullName) } catch { Write-Host "skipped  $($file.Name)  (cannot be read)"; return $null }
  if ($file.Length -le 150KB -and $im.Height -le 600) { $im.Dispose(); return $null }
  if (-not (Test-Stale $file $t)) { $im.Dispose(); return $name }
  $nh = [Math]::Min($Height, $im.Height); $nw = [int][Math]::Round($im.Width * $nh / $im.Height)
  New-Item -ItemType Directory -Force -Path $outDir | Out-Null
  Save-Jpeg $im $nw $nh $t 82L; $im.Dispose()
  Write-Host ("made     {0}  ({1:N0} KB -> {2:N0} KB)" -f $file.Name, ($file.Length / 1KB), ((Get-Item -LiteralPath $t).Length / 1KB))
  return $name
}

# A light, silent H.264 copy of a clip plus a still of its first second. Returns the two names.
function Save-Clip($file, [string]$outDir) {
  $mp4 = $file.BaseName + ".mp4"; $jpg = $file.BaseName + ".jpg"
  $t = Join-Path $outDir $mp4; $p = Join-Path $outDir $jpg
  if (-not $Ffmpeg) { Write-Host "skipped  $($file.Name)  (no ffmpeg: the page plays the original)"; return @($mp4, $jpg) }
  if (-not ((Test-Stale $file $t) -or (Test-Stale $file $p))) { return @($mp4, $jpg) }
  New-Item -ItemType Directory -Force -Path $outDir | Out-Null
  $scale = "scale=-2:'min($VideoHeight,ih)':flags=lanczos"
  & $Ffmpeg -hide_banner -loglevel error -y -i $file.FullName -an -vf "$scale,fps=24" -c:v libx264 -profile:v main -pix_fmt yuv420p -crf $VideoCrf -preset slow -movflags +faststart $t | Out-Null
  & $Ffmpeg -hide_banner -loglevel error -y -ss 1 -i $file.FullName -frames:v 1 -vf $scale -q:v 4 $p | Out-Null
  if (-not (Test-Path -LiteralPath $p)) { & $Ffmpeg -hide_banner -loglevel error -y -i $file.FullName -frames:v 1 -vf $scale -q:v 4 $p | Out-Null }
  if (Test-Path -LiteralPath $t) { Write-Host ("made     {0}  ({1:N0} KB -> {2:N0} KB)" -f $file.Name, ($file.Length / 1KB), ((Get-Item -LiteralPath $t).Length / 1KB)) }
  else { Write-Host "FAILED   $($file.Name)  (ffmpeg could not convert it)" }
  return @($mp4, $jpg)
}

function Remove-Orphans([string]$dir, $keep) {
  if (-not (Test-Path -LiteralPath $dir)) { return }
  Get-ChildItem -LiteralPath $dir -File | Where-Object { $_.Extension -match '^\.(jpg|mp4)$' -and -not $keep.ContainsKey($_.Name) } | ForEach-Object {
    Remove-Item -LiteralPath $_.FullName; Write-Host "removed  $($_.FullName.Substring($site.Length + 1))"
  }
  if (-not (Get-ChildItem -LiteralPath $dir -Force)) { Remove-Item -LiteralPath $dir }
}

$imgOut = Join-Path $auto "img"; $codes = @{}
foreach ($root in Get-ChildItem -LiteralPath (Join-Path $site "assets") -Directory | Where-Object { $_.Name -ne 'auto' } | ForEach-Object { Join-Path $_.FullName "img" } | Where-Object { Test-Path -LiteralPath $_ }) {
  foreach ($d in Get-ChildItem -LiteralPath $root -Directory) {
    $out = Join-Path $imgOut $d.Name; $keep = @{}
    foreach ($f in Get-ChildItem -LiteralPath $d.FullName -File) {
      if ($f.Extension -match $pics)     { $n = Save-Picture $f $out; if ($n) { $keep[$n] = 1 } }
      elseif ($f.Extension -match $vids) { foreach ($n in (Save-Clip $f $out)) { $keep[$n] = 1 } }
    }
    Remove-Orphans $out $keep; $codes[$d.Name] = 1
  }
}
if (Test-Path -LiteralPath $imgOut) {
  Get-ChildItem -LiteralPath $imgOut -Directory | Where-Object { -not $codes.ContainsKey($_.Name) } | ForEach-Object {
    Remove-Item -LiteralPath $_.FullName -Recurse; Write-Host "removed  assets\auto\img\$($_.Name)\"
  }
}

# ---------------------------------------------------------------- 2. poster images from the poster PDFs
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask  = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
$asTaskA = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' })[0]
function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }
function AwaitA($op) { $asTaskA.Invoke($null, @($op)).Wait(-1) | Out-Null }
[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null

$conf = Join-Path $site "assets\conference"; $posterOut = Join-Path $auto "poster"
New-Item -ItemType Directory -Force -Path $posterOut | Out-Null
$latest = @{}
Get-ChildItem -LiteralPath $conf -File -Filter '*_POSTER*.pdf' | Sort-Object Name | ForEach-Object {
  if ($_.Name -match '^([JIK]\d+)_') { $latest[$Matches[1]] = $_ }   # sorted, so _V2 overwrites the plain one
}
foreach ($code in $latest.Keys | Sort-Object) {
  $big = Join-Path $posterOut "$code.jpg"; $small = Join-Path $posterOut "${code}_s.jpg"
  if (-not ((Test-Stale $latest[$code] $big) -or (Test-Stale $latest[$code] $small))) { continue }
  $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($latest[$code].FullName)) ([Windows.Storage.StorageFile])
  $doc  = Await ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($file)) ([Windows.Data.Pdf.PdfDocument])
  $page = $doc.GetPage(0)
  $opt  = New-Object Windows.Data.Pdf.PdfPageRenderOptions
  $s    = 2000 / [Math]::Max($page.Size.Width, $page.Size.Height)
  $opt.DestinationWidth = [uint32]($page.Size.Width * $s); $opt.DestinationHeight = [uint32]($page.Size.Height * $s)
  $ms = New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
  AwaitA ($page.RenderToStreamAsync($ms, $opt))
  $img = [Drawing.Image]::FromStream([System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($ms.GetInputStreamAt(0)))
  Save-Jpeg $img $img.Width $img.Height $big 85L
  Save-Jpeg $img 360 ([int][Math]::Round($img.Height * 360 / $img.Width)) $small 85L
  $img.Dispose(); $page.Dispose()
  Write-Host ("made     poster {0}  ({1})" -f $code, $latest[$code].Name)
}
Get-ChildItem -LiteralPath $posterOut -Filter *.jpg | Where-Object { -not $latest.ContainsKey(($_.BaseName -replace '_s$', '')) } | ForEach-Object {
  Remove-Item -LiteralPath $_.FullName; Write-Host "removed  assets\auto\poster\$($_.Name)"
}

$nImg = 0; if (Test-Path -LiteralPath $imgOut) { $nImg = @(Get-ChildItem -LiteralPath $imgOut -Recurse -File).Count }
Write-Host "done: $nImg copies of pictures and clips, $(@(Get-ChildItem -LiteralPath $posterOut -File).Count) poster images  ->  assets\auto\$(if (-not $Ffmpeg) { '   (ffmpeg not found: clips were left as they are)' })"
