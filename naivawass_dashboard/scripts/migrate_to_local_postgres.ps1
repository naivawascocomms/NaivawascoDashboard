param(
    [string]$DatabaseUrl = "postgresql://postgres:0000@127.0.0.1:5432/naivawasco_local",
    [string]$ExportFile = "local_postgres_export.json",
    [string]$PostgresBin = "C:\Program Files\PostgreSQL\18\bin",
    [switch]$SkipExport,
    [switch]$SkipCreateDatabase
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$python = Join-Path $projectRoot "venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    throw "Virtualenv Python was not found at $python"
}

if (-not $SkipCreateDatabase) {
    $uri = [System.Uri]$DatabaseUrl
    if ($uri.Scheme -notin @("postgres", "postgresql")) {
        throw "DatabaseUrl must use postgres:// or postgresql://"
    }

    $databaseName = $uri.AbsolutePath.TrimStart("/")
    if (-not $databaseName) {
        throw "DatabaseUrl must include a database name"
    }

    $userParts = $uri.UserInfo.Split(":", 2)
    $databaseUser = [System.Uri]::UnescapeDataString($userParts[0])
    $databasePassword = if ($userParts.Length -gt 1) { [System.Uri]::UnescapeDataString($userParts[1]) } else { "" }
    $databasePort = if ($uri.Port -gt 0) { [string]$uri.Port } else { "5432" }

    $psql = Join-Path $PostgresBin "psql.exe"
    $createdb = Join-Path $PostgresBin "createdb.exe"
    if (-not (Test-Path $psql)) {
        throw "psql.exe was not found at $psql"
    }
    if (-not (Test-Path $createdb)) {
        throw "createdb.exe was not found at $createdb"
    }

    Write-Host "Ensuring local PostgreSQL database '$databaseName' exists ..."
    $oldPgPassword = $env:PGPASSWORD
    $env:PGPASSWORD = $databasePassword
    $databaseNameSql = $databaseName.Replace("'", "''")
    $exists = & $psql -h $uri.Host -p $databasePort -U $databaseUser -d postgres -w -tAc "select 1 from pg_database where datname = '$databaseNameSql'"
    if ($exists -ne "1") {
        & $createdb -h $uri.Host -p $databasePort -U $databaseUser -w $databaseName
    }
    if ($null -eq $oldPgPassword) {
        Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    } else {
        $env:PGPASSWORD = $oldPgPassword
    }
}

if (-not $SkipExport) {
    Write-Host "Exporting current Django data to $ExportFile ..."
    & $python manage.py dumpdata --natural-foreign --natural-primary --exclude contenttypes --exclude auth.permission --indent 2 -o $ExportFile
}

Write-Host "Running Django migrations on local PostgreSQL ..."
$env:DATABASE_URL = $DatabaseUrl
& $python manage.py migrate

Write-Host "Loading exported Django data into local PostgreSQL ..."
& $python manage.py loaddata $ExportFile

Write-Host "Verifying local PostgreSQL-backed Django database ..."
& $python manage.py check
& $python manage.py shell -c "from django.contrib.auth import get_user_model; print('Users:', get_user_model().objects.count())"

Write-Host "Done. The backend is now wired to local PostgreSQL whenever DATABASE_URL points at the local database."
