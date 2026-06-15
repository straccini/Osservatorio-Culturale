<#
  filtro-sfumato-sinopia.ps1 — Prototipo "segno Sinopia"
  ------------------------------------------------------------------
  Trasforma una foto (CC0/propria) in un duotono SFUMATO sinopia su carta:
  contorno appena percepibile, chiaroscuro morbido (matita posata di piatto).
  Usa solo .NET System.Drawing (nessuna installazione su Windows).

  Validato il 2026-06-16 su immagine CC0 del Met (Open Access).

  REGOLA DIRITTI: usare SOLO immagini CC0 / proprie / licenziate.
  Mai foto delle testate aggregate (anche stilizzate = opera derivata).

  USO:
    powershell -File filtro-sfumato-sinopia.ps1 -InPath foto.jpg -OutPath out.png
  Oppure senza argomenti: scarica un'immagine CC0 di prova dal Met.
#>
param(
  [string]$InPath = "",
  [string]$OutPath = "",
  [int]$Width = 360,            # larghezza output px
  [double]$InkMax = 0.62,       # quanta sinopia max nelle ombre (0..1) — più basso = più tenue
  [double]$Gamma = 1.5,         # curva toni: più alto = highlights restano carta, solo ombre profonde segnano
  [double]$Grain = 0.04,        # grana matita (rumore +/-)
  [double]$BlurFactor = 2.4     # sfumatura: downscale/BlurFactor poi upscale
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

if (-not $InPath) {
  $ProgressPreference='SilentlyContinue'
  $H = @{ 'User-Agent'='Mozilla/5.0' }
  $s = Invoke-RestMethod -Uri 'https://collectionapi.metmuseum.org/public/collection/v1/search?q=marble%20bust%20portrait&hasImages=true' -Headers $H -TimeoutSec 40
  foreach($id in ($s.objectIDs | Select-Object -First 25)){
    try { $o = Invoke-RestMethod -Uri "https://collectionapi.metmuseum.org/public/collection/v1/objects/$id" -Headers $H -TimeoutSec 30 } catch { continue }
    if($o.isPublicDomain -eq $true -and $o.primaryImageSmall){ $InPath = Join-Path $PSScriptRoot 'orig.jpg'; Invoke-WebRequest -Uri $o.primaryImageSmall -Headers $H -OutFile $InPath -TimeoutSec 60; Write-Host "CC0: $($o.title) (Met $id)"; break }
  }
}
if (-not $OutPath) { $OutPath = Join-Path $PSScriptRoot 'sfumato_sinopia.png' }

# Palette: carta #F3E7E1 -> sinopia scuro #6B3B30
$pr=243;$pg=231;$pb=225; $ir=107;$igc=59;$ib=48

$src=[System.Drawing.Image]::FromFile($InPath)
$tw=$Width; $th=[int]($src.Height*$tw/$src.Width)
# sfumatura: downscale forte poi upscale bicubico
$sw=[int]($tw/$BlurFactor); $sh=[int]($th/$BlurFactor)
$small=New-Object System.Drawing.Bitmap($sw,$sh)
$g=[System.Drawing.Graphics]::FromImage($small); $g.InterpolationMode='HighQualityBicubic'; $g.DrawImage($src,0,0,$sw,$sh); $g.Dispose()
$base=New-Object System.Drawing.Bitmap($tw,$th)
$g2=[System.Drawing.Graphics]::FromImage($base); $g2.InterpolationMode='HighQualityBicubic'; $g2.DrawImage($small,0,0,$tw,$th); $g2.Dispose()
$src.Dispose(); $small.Dispose()

$rand=New-Object System.Random 7
$out=New-Object System.Drawing.Bitmap($tw,$th)
for($y=0;$y -lt $th;$y++){ for($x=0;$x -lt $tw;$x++){
  $c=$base.GetPixel($x,$y)
  $l=(0.299*$c.R+0.587*$c.G+0.114*$c.B)/255.0
  $t=[Math]::Pow(1.0-$l,$Gamma)*$InkMax + ($rand.NextDouble()-0.5)*$Grain
  if($t -lt 0){$t=0}elseif($t -gt 1){$t=1}
  $r=[int]($pr+($ir-$pr)*$t); $gg=[int]($pg+($igc-$pg)*$t); $b=[int]($pb+($ib-$pb)*$t)
  $out.SetPixel($x,$y,[System.Drawing.Color]::FromArgb($r,$gg,$b))
}}
$base.Dispose()
$out.Save($OutPath,[System.Drawing.Imaging.ImageFormat]::Png); $out.Dispose()
Write-Host "OK -> $OutPath ($tw x $th)"
