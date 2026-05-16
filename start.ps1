# EHMS — start all services
# Run from the project root: .\start.ps1
# Requires Node.js installed and `npm install` run at root first.

Write-Host "Starting Emergency Health Monitoring System..." -ForegroundColor Cyan
Write-Host "  Backend  → http://localhost:5000" -ForegroundColor Green
Write-Host "  Frontend → https://localhost:5173" -ForegroundColor Green
Write-Host "  Bridge   → http://localhost:7070" -ForegroundColor Magenta
Write-Host ""
npm run dev
