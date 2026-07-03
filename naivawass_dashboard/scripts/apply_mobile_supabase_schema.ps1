param(
    [Parameter(Mandatory = $true)]
    [string]$DatabaseUrl,

    [string]$SchemaFile = "..\meter-reading-mobile\supabase\mobile_project_schema.sql",

    [string]$PostgresBin = "C:\Program Files\PostgreSQL\18\bin"
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$uri = [System.Uri]$DatabaseUrl
if ($uri.Scheme -notin @("postgres", "postgresql")) {
    throw "DatabaseUrl must use postgres:// or postgresql://"
}

$userParts = $uri.UserInfo.Split(":", 2)
$databaseUser = [System.Uri]::UnescapeDataString($userParts[0])
$databasePassword = if ($userParts.Length -gt 1) { [System.Uri]::UnescapeDataString($userParts[1]) } else { "" }
$databaseName = $uri.AbsolutePath.TrimStart("/")
$databasePort = if ($uri.Port -gt 0) { [string]$uri.Port } else { "5432" }

$psql = Join-Path $PostgresBin "psql.exe"
if (-not (Test-Path $psql)) {
    throw "psql.exe was not found at $psql"
}

$resolvedSchemaFile = Resolve-Path $SchemaFile

Write-Host "Applying mobile Supabase schema to $($uri.Host) ..."
$oldPgPassword = $env:PGPASSWORD
$env:PGPASSWORD = $databasePassword
& $psql -h $uri.Host -p $databasePort -U $databaseUser -d $databaseName -w -v ON_ERROR_STOP=1 -f $resolvedSchemaFile
if ($null -eq $oldPgPassword) {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
} else {
    $env:PGPASSWORD = $oldPgPassword
}

Write-Host "Done."
