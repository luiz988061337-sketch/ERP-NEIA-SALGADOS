@echo off
cd /d "C:\Users\neias\neia-salgados\pixel-perfect-render-4410-main\print-agent"
"C:\Program Files\nodejs\node.exe" "node_modules\tsx\dist\cli.mjs" agent.ts >> "%TEMP%\neia-agent.log" 2>&1
