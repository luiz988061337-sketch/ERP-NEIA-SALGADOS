# Ambientes e estado das migrations

Data: 2026-11-12 (atualização do backend de referência). Fonte: verificações via
SQL Editor em cada banco + verificação do bundle publicado (Production,
Preview e vitrine pública) e da API do projeto.

## Produção (backend em uso) — `ruioyioynwwwiqbjznoa`
Banco **realmente** usado pelo app publicado. Confirmado por três caminhos
independentes:
- bundle servido em `erp-neia-salgados.vercel.app` (Production, `main` @ `366074f`);
- bundle do Preview da branch de homologação (`homologacao-finalizacao`);
- vitrine pública (cardápio) — mesma ref e mesmo par URL+chave.

Dados observados por leitura via API pública: `loja_config` com a loja real
("Néia Salgados" / Sorocaba), 92 produtos no catálogo (mistura catálogo real +
itens de teste de homologação), `pedidos` e `motoboys` vazios.

Cadeia aplicada (verificado por consulta):
- Base `0000` → `0058` (objetos da 0058 depois substituídos pela 0077).
- `0072` (financeiro base), `0075` (insumos), `0076` (precificação),
  `0077` (J.1 consolidada: impressão após pagamento + Pix + guard),
  `0078` (financeiro completo), `0079` (contador), `0080` (equipe),
  `0081` (índices; seeds DEMO opcionais).
- **Nunca aplicou aqui:** `0059`, `0060`, `0061`, `0062`, `0063`
  (substituídas pela 0077), `0073`, `0074` (substituídas pela 0077).

### Projeto legado — `iqirsunzgavsuhgyjjsi`
Projeto Lovable antigo, **fora de uso** pelo app publicado (continua sendo o
`project_id` de `supabase/config.toml` e o `issuer` do manifest MCP do
Lovable). Mantido como bloqueio precautionary em `scripts/proteger-dev.mjs`
(`PROJETOS_PRODUCAO`), junto com o backend atual.

> Atenção: `supabase/config.toml` ainda aponta para o projeto legado. **Não
> trocar por `ruioyioynwwwiqbjznoa`** enquanto não existir um projeto de
> homologação — o CLI do Supabase (`db push`) passaria a mirar o backend real.

## Banco "A" (não identificado)
Outro projeto/ Editor onde `0073` + `0074` foram aplicadas e o teste J.1
passou (triggers + `enfileirar_cupom` verificados em 2026-10-10/11).
Projeto ref desconhecido — **não usar até identificar**.
Como identificar: o ref aparece na URL do dashboard
(`https://supabase.com/dashboard/project/<REF>`) e deve ser igual ao
`VITE_SUPABASE_URL` do `.env` do app publicado.

## Banco de teste (a criar — nunca use o Lovable para homologar)
1. Crie um projeto gratuito em https://supabase.com/dashboard (ex.: `neia-teste`).
2. No SQL Editor dele, rode NESTA ORDEM (cada bloco separado, conferindo o OK):
   `0000` → `0001_migration` → `0001_neia_tipos_crm` → `0002_itens_rls` →
   `0002_secure_loyalty_and_partners` → `0003` → `0004` → `0005` → `0006` →
   `0007` → `0008` → `0009` → `0010` → `0011` → `0012` → `0013` → `0014` →
   `0015` → `0016` → `0017` → `0018` → `0019` → `0020` → `0021` → `0022` →
   `0023` → `0024` → `0025` → `0026` → `0027` → `0028` → `0029` → `0030` →
   `0031` → `0032` → `0033` → `0034` → `0035` → `0036` → `0037` → `0038` →
   `0039` → `0040` → `0041` → `0042` → `0043` → `0044` → `0045` → `0046` →
   `0047` → `0048` → `0049` → `0050` → `0051` → `0052` → `0053` → `0054` →
   `0055` → `0058` → `0059` → `0060` → `0064` → `0065` → `0066` → `0067` →
   `0068` → `0069` → `0070` → `0071` → `0072` → `0077` → `0074` → `0075` →
   `0076` → `0078` → `0079` (linha do enum SOZINHA primeiro!) → `0080` →
   `0081` → `0082` → `0083`.
   Pule sem falta: `0061`, `0062`, `0063`, `0073` (superseded/com sintaxe
   inválida; a `0077` cobre o efeito delas).
   Exceção do `ALTER TYPE` (0003 e 0079): a linha `ADD VALUE` roda sozinha,
   uma por vez, fora de bloco com outras instruções.
3. Crie 6 usuários em Authentication → Users (admin, atendente, producao,
   motoboy, financeiro, contador) e rode, trocando os e-mails:
   ```sql
   INSERT INTO public.user_roles (user_id, role)
   SELECT id, v.role FROM auth.users
   CROSS JOIN (VALUES
     ('admin@teste.com','admin'), ('atendente@teste.com','atendente'),
     ('producao@teste.com','producao'), ('motoboy@teste.com','motoboy'),
     ('financeiro@teste.com','financeiro'), ('contador@teste.com','contador')
   ) AS v(email, role)
   WHERE auth.users.email = v.email
   ON CONFLICT DO NOTHING;
   ```
4. Local: copie `.env` para backup e aponte `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_PROJECT_ID` e `SUPABASE_*` para o projeto de teste +
   `NEIA_AMBIENTE=staging` (o `proteger-dev.mjs` bloqueia produção).
   `npm run dev` deve imprimir "ambiente validado".
5. Smoke: login por papel → venda PDV → Pix manual → produção → entrega;
   erro simulado nos itens; reenvio; dois Pix de mesmo valor.

## Regra
- **Produção (backend em uso) = `ruioyioynwwwiqbjznoa`** — é a única fonte
  oficial do app publicado (Production, Preview e vitrine pública). Rode aqui
  apenas as migrations `0075`→`0081` (já aplicadas) e as próximas numeradas.
- O projeto legado `iqirsunzgavsuhgyjjsi` está fora de uso, mas segue
  bloqueado para desenvolvimento local (`scripts/proteger-dev.mjs`).
- **`npm run dev` local exige um projeto de homologação**: o `.env` atual
  aponta para o backend de produção e, com a barreira corrigida, o servidor
  local **não sobe** contra ele (bloqueio proposital — fail-closed). Para
  homologar localmente, crie um projeto de teste, aponte `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_PROJECT_ID` e `SUPABASE_*` para ele e defina
  `NEIA_AMBIENTE=staging`.
- Arquivos `0059`–`0063`, `0073`, `0074` ficam no repo como registro
  histórico; **não** rodar no Lovable (a 0077 já cobre o efeito deles).
- Antes de rodar qualquer migration, conferir o ref do projeto no editor.
