# Ambientes e estado das migrations

Data: 2026-10-14. Fonte: verificações via SQL Editor em cada banco.

## Produção (Lovable) — `iqirsunzgavsuhgyjjsi`
Banco oficial do app publicado. Cadeia aplicada (verificado por consulta):
- Base `0000` → `0058` (objetos da 0058 depois substituídos pela 0077).
- `0072` (financeiro base), `0075` (insumos), `0076` (precificação),
  `0077` (J.1 consolidada: impressão após pagamento + Pix + guard),
  `0078` (financeiro completo), `0079` (contador), `0080` (equipe),
  `0081` (índices; seeds DEMO opcionais).
- **Nunca aplicou aqui:** `0059`, `0060`, `0061`, `0062`, `0063`
  (substituídas pela 0077), `0073`, `0074` (substituídas pela 0077).

## Banco "A" (não identificado)
Outro projeto/ Editor onde `0073` + `0074` foram aplicadas e o teste J.1
passou (triggers + `enfileirar_cupom` verificados em 2026-10-10/11).
Projeto ref desconhecido — **não usar até identificar**.
Como identificar: o ref aparece na URL do dashboard
(`https://supabase.com/dashboard/project/<REF>`) e deve ser igual ao
`VITE_SUPABASE_URL` do `.env` do app publicado.

## Regra
- Produção (Lovable) é a única fonte oficial: rode aqui apenas as
  migrations `0075`→`0081` (já aplicadas) e as próximas numeradas.
- Arquivos `0059`–`0063`, `0073`, `0074` ficam no repo como registro
  histórico; **não** rodar no Lovable (a 0077 já cobre o efeito deles).
- Antes de rodar qualquer migration, conferir o ref do projeto no editor.
