$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$base = 'https://bitacoraderodeo.rio-landing.com/'
$changed = @(
  'rodeo/js/modules/animales/detail.js',
  'rodeo/js/modules/animales/form.js',
  'rodeo/js/modules/animales/lotes-form.js',
  'rodeo/js/modules/animales/lotes-list.js',
  'rodeo/js/modules/animales/services.js',
  'rodeo/js/services/permisos.js'
)
$unchanged = @(
  'rodeo/js/modules/animales/index.js',
  'rodeo/js/modules/animales/list.js',
  'rodeo/js/services/contexto.js'
)
$sha1 = [System.Security.Cryptography.SHA1]::Create()
$sha256 = [System.Security.Cryptography.SHA256]::Create()
try {
  foreach ($relative in ($changed + $unchanged)) {
    $uri = $base + $relative + '?bit70audit=20261123'
    $response = Invoke-WebRequest -Uri $uri -UseBasicParsing -TimeoutSec 20 -Headers @{'Cache-Control'='no-cache'}
    if ($response.StatusCode -ne 200) { throw "HTTP $($response.StatusCode): $relative" }
    [byte[]]$remote = $response.RawContentStream.ToArray()
    [byte[]]$header = [System.Text.Encoding]::ASCII.GetBytes("blob $($remote.Length)" + [char]0)
    [byte[]]$blob = New-Object byte[] ($header.Length + $remote.Length)
    [System.Buffer]::BlockCopy($header, 0, $blob, 0, $header.Length)
    [System.Buffer]::BlockCopy($remote, 0, $blob, $header.Length, $remote.Length)
    $remoteGit = [System.BitConverter]::ToString($sha1.ComputeHash($blob)).Replace('-', '').ToLowerInvariant()
    $committedGit = (& git -C $repo rev-parse ("HEAD:$relative")).Trim().ToLowerInvariant()
    if ($LASTEXITCODE -ne 0 -or $remoteGit -ne $committedGit) { throw "Publicado distinto de HEAD: $relative ($remoteGit / $committedGit)" }
    $remoteSha = [System.BitConverter]::ToString($sha256.ComputeHash($remote)).Replace('-', '').ToLowerInvariant()
    $isChanged = $changed -contains $relative
    & git -C $repo -c core.safecrlf=false diff --quiet HEAD -- $relative 2>$null
    $actualChanged = $LASTEXITCODE -eq 1
    if ($LASTEXITCODE -notin @(0, 1) -or $actualChanged -ne $isChanged) { throw "Estado local inesperado: $relative" }
    Write-Output "PASS $relative published=HEAD $remoteSha local=$([string]$(if($isChanged){'changed'}else{'same'}))"
  }
} finally {
  $sha1.Dispose()
  $sha256.Dispose()
}
