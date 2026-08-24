# ============================================================================
#  deploy.ps1 — Osservatorio Culturale: aggiorna e pubblica in un colpo solo
# ----------------------------------------------------------------------------
#  USO (da PowerShell/Warp, dentro o fuori la cartella):
#    .\deploy.ps1                      → pull + push + deploy
#    .\deploy.ps1 -SenzaDeploy         → solo pull + push (niente pubblicazione)
#    .\deploy.ps1 -Descrizione "v4.30" → etichetta della versione
#
#  Fa, nell'ordine:
#    1. git pull        (si ferma se fallisce: mai pushare codice non aggiornato)
#    2. BONIFICA        (vedi sotto)
#    3. clasp push -f   (carica su Apps Script senza domande sul manifest)
#    4. clasp deploy    (nuova versione sulla distribuzione pubblica)
#
#  PERCHE' LA BONIFICA: il 24/08/2026 una copia spuria di docs\genmappa-europa.js
#  (script Node, usa require) e' finita nel progetto Apps Script e ha buttato
#  giu' l'app con "ReferenceError: require is not defined". Il .claspignore
#  avrebbe dovuto escluderla ma la versione di clasp in uso non l'ha rispettato.
#  Regola cablata qui: NESSUN .js dentro docs/ deve mai raggiungere Apps Script
#  — la' vivono solo appunti e strumenti, il codice dell'app sta nella radice.
# ============================================================================
param(
  [string]$Descrizione = ("deploy " + (Get-Date -Format "yyyy-MM-dd HH:mm")),
  [switch]$SenzaDeploy
)
$ErrorActionPreference = "Stop"
$DEPLOYMENT_ID = "AKfycbyUpp_zM0I4vg3AKVXQKsvhwiKUHFP4YOURGjh5a05evdeEQpuOQIjakngeWyfIzVqs"

Set-Location $PSScriptRoot
Write-Host ""
Write-Host "1/4  git pull..." -ForegroundColor Cyan
git pull
if ($LASTEXITCODE -ne 0) {
  Write-Host "ERRORE: git pull fallito. Niente push finche' il pull non passa." -ForegroundColor Red
  exit 1
}

Write-Host "2/4  bonifica file pericolosi..." -ForegroundColor Cyan
$spuri = Get-ChildItem -Path (Join-Path $PSScriptRoot "docs") -Filter "*.js" -File -ErrorAction SilentlyContinue
if ($spuri) {
  $spuri | ForEach-Object {
    Write-Host ("   rimosso: docs\" + $_.Name + "  (uno script non-app qui ha gia' spento l'app una volta)") -ForegroundColor Yellow
    Remove-Item $_.FullName -Force
  }
} else {
  Write-Host "   pulito."
}

Write-Host "3/4  clasp push..." -ForegroundColor Cyan
clasp push -f
if ($LASTEXITCODE -ne 0) {
  Write-Host "ERRORE: clasp push fallito. Deploy annullato." -ForegroundColor Red
  exit 1
}

if ($SenzaDeploy) {
  Write-Host "4/4  saltato (-SenzaDeploy). L'editor e' aggiornato, l'app pubblica NO." -ForegroundColor Yellow
  exit 0
}
Write-Host "4/4  clasp deploy..." -ForegroundColor Cyan
clasp deploy -i $DEPLOYMENT_ID -d $Descrizione
if ($LASTEXITCODE -ne 0) {
  Write-Host "ERRORE: deploy fallito. L'app pubblica resta alla versione precedente." -ForegroundColor Red
  exit 1
}
Write-Host ""
Write-Host "FATTO. Apri l'app con Ctrl+Shift+R per vedere la versione nuova." -ForegroundColor Green
