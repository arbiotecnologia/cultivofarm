<#
=====================================================================
 PROMOÇÃO CULTIVOFARM — MONTAGEM DETERMINÍSTICA DO PACOTE ESTRUTURAL
 Equivalente PowerShell de 22-montar-pacote-estrutural.sh.

 NÃO acessa banco. NÃO executa SQL. Apenas lê migrations e grava arquivos.

 Uso:
   pwsh restoration/promocao-cultivofarm/22-montar-pacote-estrutural.ps1 -OutDir gerado
   pwsh ... -OutDir gerado -IncluirRevisadas .\lista.txt   # após revisão humana
=====================================================================
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$OutDir,
  [string]$IncluirRevisadas
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$TargetRef = 'swzpzcwiasxmjutrmvkm'
$Forbidden = @('navfzbwgwzruipouyfnk', 'ikaauvsflpmamgxmkhoq', 'yzszlzjpovmcteuxjznj')

$Pkg        = Split-Path -Parent $PSCommandPath
$Root       = Resolve-Path (Join-Path $Pkg '..\..')
$Migrations = Join-Path $Root 'supabase\migrations'
$Csv        = Join-Path $Pkg '21-manifesto-migrations.csv'

if (-not (Test-Path $Csv)) {
  throw 'ABORT: manifesto ausente. Rode 20-classificar-migrations.py.'
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$Out = Join-Path $OutDir '30-pacote-estrutural-cultivofarm.sql'
$Log = Join-Path $OutDir '30-pacote-estrutural-cultivofarm.manifest.txt'

$incluidas = @(Import-Csv -Path $Csv |
  Where-Object { $_.decisao -eq 'INCLUIDA' } |
  ForEach-Object { $_.arquivo })

if ($IncluirRevisadas) {
  if (-not (Test-Path $IncluirRevisadas)) { throw 'ABORT: lista de revisadas inexistente.' }
  $extra = Get-Content $IncluirRevisadas |
    Where-Object { $_.Trim() -ne '' -and -not $_.StartsWith('#') }
  $incluidas = @($incluidas + $extra | Select-Object -Unique | Sort-Object)
}

if ($incluidas.Count -eq 0) { throw 'ABORT: nenhuma migration incluída.' }

$header = @"
-- ===================================================================
-- PACOTE ESTRUTURAL CULTIVOFARM — alvo $TargetRef
-- Gerado por 22-montar-pacote-estrutural.ps1 a partir de
-- 21-manifesto-migrations.csv. NAO EDITAR A MAO.
-- Migrations incluídas: $($incluidas.Count)
-- ===================================================================

\set ON_ERROR_STOP on
BEGIN;
SET LOCAL promocao.target_ref = '$TargetRef';
DO `$guard`$
BEGIN
  IF current_setting('promocao.target_ref', true) <> '$TargetRef' THEN
    RAISE EXCEPTION 'ABORT: alvo incorreto para o pacote CultivoFarm.';
  END IF;
END `$guard`$;

"@
Set-Content -Path $Out -Value $header -Encoding utf8 -NoNewline
Set-Content -Path $Log -Value '' -Encoding utf8 -NoNewline

foreach ($f in $incluidas) {
  $src = Join-Path $Migrations $f
  if (-not (Test-Path $src)) { throw "ABORT: migration ausente: $f" }

  $body = Get-Content -Path $src -Raw
  foreach ($bad in $Forbidden) {
    if ($body -like "*$bad*") { throw "ABORT: $f referencia ambiente proibido ($bad)." }
  }

  Add-Content -Path $Out -Encoding utf8 -Value @"
-- ---------------------------------------------------------------
-- BEGIN $f
-- ---------------------------------------------------------------
$body

-- END $f

"@
  $h = (Get-FileHash -Path $src -Algorithm SHA256).Hash.ToLower()
  Add-Content -Path $Log -Encoding utf8 -Value "$h  $f"
}

Add-Content -Path $Out -Encoding utf8 -Value @"
-- Pós-check mínimo antes do COMMIT: nenhuma tabela public sem RLS.
DO `$post`$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity;
  IF v > 0 THEN RAISE EXCEPTION 'ABORT: % tabela(s) public sem RLS.', v; END IF;
END `$post`$;

COMMIT;
"@

$pkgHash = (Get-FileHash -Path $Out -Algorithm SHA256).Hash.ToLower()
Write-Output "PACOTE_OK arquivo=$Out"
Write-Output "MIGRATIONS_INCLUIDAS=$($incluidas.Count)"
Write-Output "SHA256=$pkgHash"
Write-Output "MANIFESTO_HASHES=$Log"
