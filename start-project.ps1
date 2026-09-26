param(
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

function Test-PortOpen([int]$Port) {
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $task = $client.ConnectAsync('127.0.0.1', $Port)
        return $task.Wait(500) -and $client.Connected
    } catch {
        return $false
    } finally {
        $client.Dispose()
    }
}

function Test-CardPrint([int]$Port) {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:$Port/" -TimeoutSec 10
        return $response.StatusCode -eq 200 -and $response.Content.Contains('CARDPRINT')
    } catch {
        return $false
    }
}

function Show-ServerLog {
    foreach ($path in @($script:stderrLog, $script:stdoutLog)) {
        if (Test-Path -LiteralPath $path) {
            Get-Content -LiteralPath $path -Tail 20 | Write-Host
        }
    }
}

try {
    if (-not (Get-Command node.exe -ErrorAction SilentlyContinue) -or
        -not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
        throw 'Node.js/npm was not found. Install Node.js LTS and try again.'
    }
    if (-not (Test-Path -LiteralPath '.env')) {
        throw 'Missing .env. Copy .env.example to .env and set DATABASE_URL first.'
    }

    $databaseLine = Get-Content -LiteralPath '.env' | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
    if (-not $databaseLine) { throw 'DATABASE_URL is missing from .env.' }
    $databaseUrl = ($databaseLine -replace '^\s*DATABASE_URL\s*=\s*', '').Trim().Trim('"', "'")
    try { $databaseUri = [uri]$databaseUrl } catch { throw 'DATABASE_URL is not a valid MySQL URL.' }
    if ($databaseUri.Scheme -ne 'mysql' -or -not $databaseUri.Host) {
        throw 'DATABASE_URL must use mysql://host:port/database.'
    }
    $databasePort = if ($databaseUri.IsDefaultPort) { 3306 } else { $databaseUri.Port }
    if ($databaseUri.Host -in @('localhost', '127.0.0.1', '::1') -and
        -not (Test-PortOpen $databasePort)) {
        $service = Get-Service -Name 'MySQL80', 'MySQL*', 'MariaDB*' -ErrorAction SilentlyContinue |
            Where-Object { $_.Status -ne 'Running' } | Select-Object -First 1
        if ($service) {
            Write-Host "Starting MySQL service $($service.Name)..."
            try {
                Start-Service -Name $service.Name
                $service.WaitForStatus('Running', [TimeSpan]::FromSeconds(20))
            } catch {
                throw "MySQL is not reachable on port $databasePort. Start the MySQL service, then run this launcher again."
            }
        }
        if (-not (Test-PortOpen $databasePort)) {
            throw "MySQL is not reachable on port $databasePort. Check the service and DATABASE_URL."
        }
    }

    if (-not (Test-Path -LiteralPath 'node_modules/next/package.json') -or
        -not (Test-Path -LiteralPath 'node_modules/.bin/prisma.cmd')) {
        Write-Host 'Installing project dependencies...'
        & npm.cmd install
        if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' }
    }

    Write-Host 'Applying database migrations...'
    & npm.cmd run db:migrate
    if ($LASTEXITCODE -ne 0) {
        throw 'Database migration failed. Check MySQL credentials, database name, and service status.'
    }

    $port = 0
    $existing = $false
    foreach ($candidate in 3000..3010) {
        if (Test-PortOpen $candidate) {
            if (Test-CardPrint $candidate) { $port = $candidate; $existing = $true; break }
        } else { $port = $candidate; break }
    }
    if (-not $port) { throw 'Ports 3000-3010 are occupied. Free one port and try again.' }
    $url = "http://localhost:$port/"

    if (-not $existing) {
        $logDirectory = Join-Path $PSScriptRoot 'storage/logs'
        New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
        $script:stdoutLog = Join-Path $logDirectory 'project-server.out.log'
        $script:stderrLog = Join-Path $logDirectory 'project-server.err.log'
        Write-Host "Starting the website and API at $url ..."
        $server = Start-Process -FilePath $env:ComSpec -ArgumentList @('/d', '/s', '/c', "npm.cmd run dev -- --port $port") `
            -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput $stdoutLog `
            -RedirectStandardError $stderrLog -PassThru
        $ready = $false
        for ($attempt = 0; $attempt -lt 90; $attempt++) {
            if (Test-CardPrint $port) { $ready = $true; break }
            if ($server.HasExited) { break }
            Start-Sleep -Seconds 1
        }
        if (-not $ready) {
            Show-ServerLog
            throw "The website did not start. See $stdoutLog and $stderrLog."
        }
    } else {
        Write-Host "The project is already running at $url"
    }

    if (-not $NoBrowser) {
        try { Start-Process $url }
        catch { Write-Host "Browser could not open automatically. Visit $url manually." -ForegroundColor Yellow }
    }
    Write-Host "Ready: $url" -ForegroundColor Green
    Write-Host 'Next.js serves both the web page and /api routes. MySQL runs as a local service.'
    if (-not $existing) { Write-Host "Server logs: $stdoutLog" }
    exit 0
} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
