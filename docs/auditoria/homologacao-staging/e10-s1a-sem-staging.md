# E10-S1A — Testar no projeto atual sem staging separado (planejamento)

> Loja fora do ar; banco com 27 pedidos e 119 jobs (possível massa antiga).
> Agente de impressão NÃO está rodando nesta máquina (verificado via
> processos). Nenhuma execução realizada — plano para autorização.

## 1. Usuários temporários: viável, com condições

- Criação é manual no dashboard (Auth → Add user); sem ela, nada de RLS
  por papel. 1 papel por usuário (multi-papel invalida negações).
- Risco: contas extras em produção. Mitigação: e-mails `teste+papel@...`
  distintos, senhas fortes, exclusão ao final + verificação
  `user_roles` zerada para eles.

## 2. Interferência com dados reais

- Regra de ouro: NUNCA tocar linhas sem prefixo de teste; baseline de
  contagens antes (bloco 1) e depois (igualdade exigida).
- Triggers que test-rows disparam (efeitos colaterais): cupom na fila
  (apagar via cascade), `fritura_fila` (cascade), `motoboy_historico`
  (SET NULL → limpar explícito), status do motoboy (restaurar ao final),
  **insumos em `em_producao` (0075 pode consumir estoque real — NÃO levar
  teste a `em_producao`, ou auditar/restaurar estoque depois)**.
- Push/WhatsApp/fiscal: só via invoke direto ou UI legada — não usar
  durante os testes. Print-agent: confirmar parado também no PC da loja,
  senão imprime jobs de teste fisicamente.

## 3. RLS sem alterar registros reais

- Leituras por papel via API (anon nega; cada papel lê o seu).
- Escritas negadas (tentar e receber `403/RAISE`) NÃO alteram nada —
  são evidência válida.
- Escritas permitidas SOMENTE em linhas `E10B-` (depois limpar).
- Guard/funções 0084/0085: testar com JWT simulado (padrão já usado).

## 4. Isolamento sintético e remoção

- Prefixo `E10B-`/`STG-` em cliente/obs/motivo de toda linha de teste.
- Remoção: `fila_impressao` (cascade) → `rota_pedidos` → `rotas_entrega`
  criadas → `pedidos E10B-` (cascade leva itens, histórico, fritura,
  atrasos, fiscal) → limpar `motoboy_historico` com `pedido_id NULL`
  do período → restaurar `motoboys.status` → excluir `user_roles` +
  usuários no dashboard → recontar baseline.

## 5. TANCA TP-550

- Sem agente rodando: só mecânica de fila (enfileirar, conflito,
  reimpressão, contador) — sem papel.
- Com papel: 1 job `tipo=teste`, agente supervisionado, fora do horário
  de movimento; nunca `tipo=pedido` de teste com agente live sem aviso.

## 6. Interrupção imediata (qualquer um)

Linha sem prefixo alterada/criada; contagem baseline divergente; job
físico impresso sem ordem; segredo em log; erro de guard/trigger não
mapeado; dúvida sobre o ref do projeto. Parar, preservar evidência,
reportar — nunca "corrigir" escrevendo mais.

## 7. Alternativa local (se o projeto atual for vetado)

PostgreSQL puro sem Docker: exige stubs (`auth.users/uid/jwt`,
`has_role`+`user_roles`, `gen_random_uuid`) e perde GoTrue/RLS-por-JWT,
Realtime e Storage. Serve para lógica SQL (funções/triggers/guard),
NÃO para RLS, auth, fila concorrente real ou impressão. Supabase CLI
local também exige Docker (ausente). Veredito: parcial, não substitui.

## Recomendação

Testar no projeto atual é VIÁVEL sob as 6 condições (baseline,
prefixos, agente parado, sem `em_producao`, limpeza verificada, parada
a qualquer divergência) — com a loja parada, o risco residual é baixo
e reversível. Se qualquer condição falhar, voltar ao `neia-teste`.
