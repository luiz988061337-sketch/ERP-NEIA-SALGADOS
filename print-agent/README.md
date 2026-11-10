# Agente de impressao local — Tanca TP-550 (Windows + USB)

Arquitetura (navegador NUNCA acessa USB direto):

SITE <-> SUPABASE `fila_impressao` <-> AGENTE neste notebook <-> USB Tanca TP-550

## 1. Detectar a impressora (obrigatorio antes de tudo)

No PowerShell do notebook da loja:

```powershell
Get-Printer | Select-Object Name, DriverName, PortName, Shared
rundll32 printui.dll,PrintUIEntry /k /n "Tanca TP-550"
```

Anote: nome exato, driver, porta USB. Nao troque o driver sem necessidade.

## 2. Configurar

Criar o arquivo `.env` na raiz do agente a partir do template `.env.example`:

```bash
cp .env.example .env
```

Editar as variaveis (sem valores reais versionados):

```
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
STAFF_EMAIL=
STAFF_PASSWORD=
PRINTER_NAME=Tanca TP-550
POLL_MS=5000
MAX_TENTATIVAS=5
RETRY_MIN=2
```

`SUPABASE_ANON_KEY` so como fallback legado durante a transicao.

Arquitetura segura: usar publishable key + autenticacao staff. NAO usar service_role no computador da impressao.

## 3. Como funciona

- Polling `fila_impressao` com status `pendente` (respeitando `imprimir_apos`).
- Marca `enviando` (tentativa+1), imprime via `imprimir.ps1` (Tanca TP-550 ou HP Smart Tank 584 / folha A4).
- Sucesso -> `impresso` + `pedidos.impresso = true`; erro -> `erro` + `ultimo_erro` (mantem na fila, sem duplicar: `trabalho_uuid` UNIQUE).
- Offline -> mantem fila; ao voltar, processa sem duplicidade.
- Reimpressao = nova linha com `motivo_reimpressao` + contador (nunca reusa uuid).

## 4. Autenticacao e recuperacao

- Login inicial via `STAFF_EMAIL` + `STAFF_PASSWORD` (conta staff dedicada).
- Refresh automatico do supabase-js; estados: `AUTH_LOGIN`, `AUTH_OK`, `AUTH_REFRESH_FAILED`, `AUTH_RELOGIN`, `AUTH_RELOGIN_FAILED`, `AUTH_RECOVERED`.
- Em falha de auth, com backoff limitado (max. 3 tentativas), tenta novo login staff; apos recuperar, continua o polling normalmente.
- Logs indicam apenas estados, nunca tokens/senhas/chaves.

## 5. Teste

1. No admin: Testar Impressora (cria linha `tipo='teste'`).
2. Agente imprime: "NIA SALGADOS / TESTE DE IMPRESSAO / Tanca TP-550 / Data-Hora".
3. Desligue a impressora -> status `erro`, pedido permanece no sistema + alerta.
4. Ligue -> recupera sozinho, sem duplicar.

## 6. Agente push (sem Edge/deploy)

Envia Web Push varrendo mudancas de status (mesma criptografia da Edge push-enviar; VAPID + aes128gcm RFC8291); textos espelham a Edge (fonte canonica). Rode junto ao agente de impressao.

1. No `.env` do print-agent: `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT` (os do ambiente real, nao os antigos).
2. Rode: `npx tsx push-agent.ts` (ou criar `iniciar-push.bat` igual ao `iniciar-agente.bat`).
3. Boot semeia em silencio (sem inundar); mudanca de etapa + cliente inscrito = push em segundos.

## Seguranca

- `.env` e `.sessao.json` nunca devem ser versionados.
- O agente de impressao NAO usa `SUPABASE_SERVICE_ROLE_KEY`.
- Chave: `SUPABASE_PUBLISHABLE_KEY` (preferida) com fallback legado `SUPABASE_ANON_KEY`.
- Conta staff dedicada: sem papel ampliado para impressora (nao transformar em admin).
