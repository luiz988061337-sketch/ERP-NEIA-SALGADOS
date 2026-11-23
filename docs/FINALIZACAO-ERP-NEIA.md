# FINALIZAÇÃO ERP NÉIA SALGADOS — PONTO DE RETOMADA

## Estado atual

- Etapa: FASE A concluída; FASE B validada localmente; FASE C implementada localmente e aguardando teste integrado; FASE D revisada e validada localmente; FASE E corrigida e validada localmente; FASE F corrigida e validada localmente; FASE G (Central de Entregas) corrigida e validada localmente; FASE H (App Motoboy) revisada e validada localmente; FASE I (Financeiro Premium) revisada e validada localmente.
- Branch: `homologacao-finalizacao`.
- Checkpoint desta etapa: `checkpoint: FASE I financeiro premium validado`.
- Commit FASE H: `ffc4ad4` — `checkpoint: FASE H app motoboy validado`.
- Commit FASE G: `ef45f5d` — `checkpoint: FASE G central de entregas validada`.
- Commit FASE F: `ec7138d` — `checkpoint: FASE F producao e estoque validados`.
- Commit FASE E: `ba40cc5` — `checkpoint: FASE E atendente e pdv isolados`.
- Commit FASE D: `2424ab1` — `checkpoint: FASE D cliente e checkout validados`.
- Commit FASE C: `6df1dbf` — `checkpoint: FASE C redirect de auth seguro`.
- Commit FASE B: `10e48e1` — `checkpoint: FASE B build rotas e navegacao`.
- Commit M24: `0044673bbe403a800547163e5dec9db567bb8512` — `checkpoint: M24 ACL segura para homologacao`.
- Checkpoint anterior: `1dc0e0d0c0ddd7c008628f473d33799136d689e2`.
- Diretório: `C:\Users\luiz9\Projetos\ERP-NEIA-SALGADOS`.

## Regras de execução

- Preservar layouts aprovados; não refazer telas.
- Não alterar `main`; não fazer push, deploy ou acessar produção.
- Não executar migrations em banco remoto sem autorização específica.
- Não aplicar `0124` ao Supabase existente; não reaplicar `0098`.
- Usar `lflzlcqinarrcgncafol` somente após confirmação de identidade e acesso autorizado.
- Não usar `.env` versionado com referências de produção para iniciar aplicativos ou testes.
- Checkpoints locais pequenos, após verificação real de cada módulo.
- Não declarar homologação integrada quando houver apenas teste local ou simulação.

## Progresso

| Item | Status | Evidência |
|---|---|---|
| M24 — migration `0124`, teste e documentação | IMPLEMENTADO, AGUARDANDO TESTE INTEGRADO | commit `0044673`; verificação estática de assinaturas, ACL, owner, `SECURITY DEFINER`, pré/pós-condições e atomicidade pelo runner |
| M24 — aplicação em banco | BLOQUEADO POR DEPENDÊNCIA EXTERNA | exige autorização e laboratório isolado; não executar no Supabase existente |
| FASE B — build, rotas e navegação | IMPLEMENTADO, AGUARDANDO TESTE INTEGRADO | 89 rotas inventariadas; 0 links literais quebrados; `/historia` restaurada; hashes `/financeiro#caixa` e `/financeiro#relatorios` com alvos reais; CSS `?url` em rotas preview; `typecheck` e `build` passaram |
| FASE C — autenticação e autorização | IMPLEMENTADO, AGUARDANDO TESTE INTEGRADO | `destinoInternoSeguro` bloqueia `//`, `/\`, esquemas externos e controles; `/auth` usa o helper; suíte `homologar-auth-staging.test.mjs` passou com 10 testes offline; Auth/RLS remoto segue sem validação integrada |
| FASE D — Cliente e Checkout | IMPLEMENTADO, AGUARDANDO TESTE INTEGRADO | HOMO-13B/HOMO-CLIENTE-15 preservados; wizard, frete pós-endereço, criação atômica, PIX local, pedido/conta e reembolsos revisados; suítes locais de carrinho, taxa, pagamentos, PIX e reembolsos passaram |
| FASE E — Atendente e PDV | IMPLEMENTADO, AGUARDANDO TESTE INTEGRADO | PDV em preview não consulta `pedidos`; ficha da produção bloqueada em prévia; Central não grava alertas compartilhados em preview e propaga reconhecimento; `finalizar()` exige papel; aceite local e suítes de Central/Produção passaram |
| FASE F — Produção e Estoque | IMPLEMENTADO, AGUARDANDO TESTE INTEGRADO | remessas agregam itens duplicados e separam produtos com mesmo nome; reservas consomem por `produtoId`; ações da fila de impressão não falseiam sucesso; perda/inventário usam estoque esperado e verificam erro do movimento; filtros `not` da demo aplicados; `typecheck` e `build` passaram |
| FASE G — Central de Entregas | IMPLEMENTADO, AGUARDANDO TESTE INTEGRADO | Kanban e seletores passaram a usar `pronto`/legado sem dono como aguardando; atribuídos incluem `aguardando_motoboy` com dono; filtro do servidor inclui prontos sem motoboy; troca de filtro invalida a chave nova; suítes E4, E8 e preview central passaram |
| FASE H — App Motoboy | IMPLEMENTADO, AGUARDANDO TESTE INTEGRADO | `/motoboy` usa o painel RPC fora da demo; atribuição/aceite pela Central e trava de duplo clique preservados; transições RPC e GPS com consentimento revisados; mensagem de sem conexão não promete reenvio; testes de corte, monitor, E5 e E9 passaram; `typecheck` e `build` passaram |
| FASE I — Financeiro Premium | IMPLEMENTADO, AGUARDANDO TESTE INTEGRADO | `/financeiro` mantém o layout aprovado e usa a RPC real fora da demo; conciliação, caixa, contas e movimentações invalidam todo o fluxo financeiro; leituras com falha não exibem zero fictício; vencidas usam saldo restante por tipo; data corrente em fuso de São Paulo; suítes financeiras e build passaram |
| FASE J — integrações externas | PENDENTE | — |
| FASE K — testes completos e segurança | PENDENTE | — |
| FASE L — homologação visual e funcional | PENDENTE | — |
| FASE M — preparação de publicação | PENDENTE | — |

## Testes executados até agora

- M24: verificação estática e Git do checkpoint; nenhum SQL executado.
- `npm.cmd run typecheck`: passou (`tsc --noEmit`).
- `npm.cmd run build`: passou (cliente, SSR e Nitro; `.output/public` e `.output/server` gerados).
- `npm.cmd run lint`: falhou com dívida pré-existente de 16127 problemas (principalmente `prettier/prettier`); não houve reformatação em massa.
- `npm.cmd run teste:guard`: passou — 41 cenários.
- `npm.cmd run teste:isolamento`: passou — 46 cenários.
- `npm.cmd run teste:homo-cliente-02`: passou.
- `npm.cmd run teste:aceite-local`: passou após configurar ambiente fictício no próprio teste — 7 cenários e verificações estáticas.
- `node --experimental-transform-types --test scripts/homologar-auth-staging.test.mjs`: passou — 10 testes, incluindo Destinos internos de redirect; nenhuma rede, nenhuma escrita.
- `npm.cmd run typecheck`: passou novamente após FASE C.
- `npm.cmd run build`: passou novamente após FASE C.
- FASE D: `npm.cmd run teste:homo-cliente-02` (15), `scripts/checkout-taxa.test.mjs` (8), `scripts/e7-pagamentos.test.mjs` (14), `scripts/pix-reader.test.mjs` (8), `scripts/reembolsos-estornos.test.mjs` (27) e `scripts/reembolsos-estornos-origens.test.mjs` (14) passaram.
- FASE E: `npm.cmd run teste:aceite-local`, `npm.cmd run teste:central`, `npm.cmd run teste:producao-remessas` e `npm.cmd run teste:isolamento` passaram; `typecheck` e `build` passaram novamente.
- FASE F: `scripts/e6-impressao.test.mjs`, `npm.cmd run teste:insumos`, `scripts/estoque-operacao-atomica.test.mjs`, `npm.cmd run teste:producao`, `npm.cmd run teste:producao-remessas`, `npm.cmd run teste:integracao`, `npm.cmd run teste:criacao-wrapper` e `npm.cmd run teste:isolamento` passaram; `typecheck` e `build` passaram novamente.
- FASE G: `node --experimental-transform-types scripts/e4-atribuicao.test.mjs`, `node scripts/e8-sincronizacao.test.mjs` e `node scripts/preview-central-v2.test.mjs` passaram; `typecheck` e `build` passaram novamente.
- FASE H: `node --test scripts/motoboy-corte-ui.test.mjs`, `node --test scripts/motoboy-monitor-localizacao.test.mjs`, `node scripts/e5-finalizacao.test.mjs` e `node scripts/e9_1-bloqueios-p0.test.mjs` passaram; `tsc --noEmit` e `npm.cmd run build` passaram novamente.
- FASE I: `node --experimental-transform-types scripts/financeiro-operacoes-atomicas.test.mjs`, `scripts/financeiro-premium.test.mjs`, `scripts/financeiro-m.test.mjs`, `scripts/financeiro-conciliacao.test.mjs`, `scripts/financeiro-parciais-modelo.test.mjs` (26), `scripts/ofx.test.mjs` e `scripts/auditoria.test.mjs` passaram; `tsc --noEmit` em background terminou sem saída e `npm.cmd run build` passou novamente.
- O loop completo de testes locais teve saída truncada; FASE K não foi declarada concluída.

## Bloqueios reais

- Execução de SQL em Supabase hospedado: depende de autorização explícita.
- Credenciais de pagamentos, WhatsApp, GPS e fiscal: não utilizar ou ativar sem autorização.
- Deploy/publicação: fora de escopo até aprovação final.
- `lint` com dívida pré-existente: não bloqueia build, mas impede status verde; correção em massa não foi feita para preservar diffs e layouts aprovados.
- Testes de navegação em navegador/homologação integrada: ainda pendentes; build e testes estáticos não substituem homologação.
- FASE H: concorrência RPC em PG isolado e homologação integrada do app Motoboy pendentes; não há fila offline persistida de GPS — a mensagem foi corrigida para não prometer reenvio.
- FASE I: conciliação bancária/OFX reais, atomicidade, RLS e concorrência em PostgreSQL isolado pendentes; premissa de negócio do ponto de equilíbrio com margem de contribuição segue fora de escopo.

## Próxima ação concreta

1. Criar checkpoint local da FASE I com invalidação do fluxo financeiro, falhas de leitura explícitas e data em fuso de São Paulo.
2. FASE J: inventariar integrações externas e manter credenciais reais como dependência externa.
3. Retomar FASE J em diante, mantendo checkpoints curtos por módulo.
4. Antes da entrega final, gerar `ERP-NEIA-SALGADOS-PRONTO-PARA-HOMOLOGACAO.md` com status honesto de cada fase.
