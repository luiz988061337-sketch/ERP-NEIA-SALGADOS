# Agente de impressão local — Tanca TP-550 (Windows + USB)

Arquitetura (navegador NUNCA acessa USB direto):

SITE → SUPABASE `fila_impressao` → AGENTE neste notebook → USB → Tanca TP-550

## 1. Detectar a impressora (obrigatório antes de tudo)

No PowerShell do notebook da loja:

```powershell
Get-Printer | Select-Object Name, DriverName, PortName, Shared
Get-PrinterDriver | Select-Object Name
# página teste do Windows:
rundll32 printui.dll,PrintUIEntry /k /n "Tanca TP-550"
```

Anote: nome exato, driver, porta USB. NÃO troque o driver sem necessidade.

## 2. Configurar

```powershell
copy .env.example .env
# edite: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (só no agente, nunca no site), PRINTER_NAME="Tanca TP-550", POLL_MS=5000
npm install
npm start
```

## 3. Como funciona

- Polling `fila_impressao WHERE status='pendente' AND (imprimir_apos IS NULL OR imprimir_apos <= now())`
- Marca `enviando` (tentativa+1), imprime via `Out-Printer` / `notepad /p` (texto do cupom em `payload`)
- Sucesso → `impresso` + `pedidos.impresso=true`; erro → `erro` + `ultimo_erro` (mantém na fila, sem duplicar: `trabalho_uuid` UNIQUE)
- Offline → mantém fila; ao voltar, processa sem duplicidade
- Reimpressão = nova linha com `motivo_reimpressao` + contador (nunca reusa uuid)

## 4. Teste

1. No admin: 🖨️ Testar Impressora (cria linha `tipo='teste'`)
2. Agente imprime: NÉIA SALGADOS / TESTE DE IMPRESSÃO / Tanca TP-550 / Data-Hora
3. Desligue a impressora → status `erro`, pedido continua no sistema + alerta "Pedido confirmado, mas a impressão não foi concluída."
4. Ligue → recupera sozinho, sem duplicar

## 5. Agente push (sem Edge/deploy)

Envia Web Push varrendo mudancas de status (mesma criptografia da Edge push-enviar). Uso quando a Edge ainda nao foi deployada.

1. No .env do print-agent: VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY + VAPID_SUBJECT (as do par ao vivo, nao as BKq antigas)
2. Rode: npx tsx push-agent.ts (ou crie iniciar-push.bat igual ao iniciar-agente.bat)
3. Boot semeia em silencio (sem inundar); mudanca de etapa + cliente inscrito = push em segundos.
