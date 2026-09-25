$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js 未安装或不在 PATH 中，请先安装 Node.js LTS。"
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm 未安装或不在 PATH 中，请先安装 Node.js LTS。"
}

if (-not (Test-Path -LiteralPath "node_modules\next\package.json")) {
    Write-Host "正在安装前端依赖..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) { throw "依赖安装失败。" }
}

Write-Host "前端启动地址：http://localhost:3000" -ForegroundColor Green
npm run dev
