# Cadastro de Combos e reservas unificadas

## Resultado

“Combos” no menu **Produtos** deixou de ser uma janela de reserva e passou a ser a página
`/preview/combos`, com cadastro, consulta, edição, duplicação, ativação/desativação, busca e
filtros. O combo **não tem estoque, saldo nem reserva própria**: a reserva acontece por sabor no
mesmo Estoque de Salgados, somada em um único total por produto.

- Branch: `homologacao-finalizacao`.
- HEAD preservado: `673a0c98e4452a608cfe5f3065712ffa6cc0709a`.
- Deployment: **`dpl_2d9BkkpwSqgXAwP1JZcYwoUFrRMc`**.
- `vercel inspect`: **READY**, `target: preview`.
- Publicação com `vercel deploy --yes`, **sem `--prod`**.
- Proteção **Vercel Authentication** mantida; a automação usou a sessão do CLI e cookies apenas em
  diretório temporário, fora do projeto.

### URLs completas

1. **Cadastro de Combos:** https://erp-neia-salgados-lwtyueyta-luiz988061337-3147s-projects.vercel.app/preview/combos
2. **Estoque de Salgados:** https://erp-neia-salgados-lwtyueyta-luiz988061337-3147s-projects.vercel.app/preview/estoque-salgados
3. **Cadastro de Produtos:** https://erp-neia-salgados-lwtyueyta-luiz988061337-3147s-projects.vercel.app/preview/cadastro-produtos
4. **Estoque de Insumos:** https://erp-neia-salgados-lwtyueyta-luiz988061337-3147s-projects.vercel.app/preview/estoque-insumos
5. **Estoque de Embalagens:** https://erp-neia-salgados-lwtyueyta-luiz988061337-3147s-projects.vercel.app/preview/estoque-embalagens

## Inspeção e reutilização

- `src/lib/totals.ts` (`PASSO_COMBO`, `MINIMO_COMBO`, `isMultiploCombo`) e `src/lib/combo.ts`
  (`COMBO_CATEGORIAS_FALLBACK`, `saborCurto`) fornecem as regras comerciais já existentes.
- `src/routes/combo.tsx` (“Monte seu combo”) foi lido e **não foi alterado**: a modalidade de combo
  personalizado por múltiplos de 50 continua intacta. O checkout exige que os componentes do combo
  pertençam à mesma categoria e que a composição feche exatamente o total; a prévia segue as duas
  regras.
- `src/lib/catalog.ts` e `src/routes/admin.tsx` (cadastro operacional que grava no Supabase) foram
  inspecionados e **não foram montados nem modificados**.
- Reutilizados sem alteração: `AdminShell`, `ModuleHeader`, `MetricCard`, `SectionCard`, `DarkTable`,
  `DarkTableRow`, `StatusBadge`, `ActionButton`, `Dialog`, `Input`, `Label`, `Campo`, `Seletor`,
  `ModalEstoque` e os tokens `--erp-*`.
- `estoques.css` ganhou apenas classes de composição `est-combo-*`. Nenhum tema, card, tabela ou
  menu das telas aprovadas foi redesenhado.

## Cadastro de Combos

Página com o AdminShell real, indicadores, busca por nome, filtro por categoria e situação e o botão
**+ Cadastrar Combo**.

Formulário: nome, descrição, categoria comercial, quantidade total (múltiplo de 50), situação
ativo/inativo e os sabores participantes com a quantidade de cada um.

- Os sabores vêm do **Cadastro de Produtos** (mesmos identificadores, sem duplicar cadastro).
- A soma das quantidades precisa fechar exatamente o total configurado; caso contrário a gravação é
  recusada com a mensagem do valor somado e do total esperado.
- Só entram sabores **ativos**, elegíveis (`tipoVenda = combo_50`) e da **mesma categoria** do combo.
- Cada sabor aparece uma única vez na composição.
- Ações na tabela: consultar composição, editar, duplicar e ativar/desativar.
- O preço de venda é o **unitário da categoria**, como no checkout existente (Fritos R$ 1,60/un.;
  Assados R$ 2,30/un. — valores fictícios). Combos de categorias diferentes **não presumem o mesmo
  preço**: o valor é calculado a partir da categoria de cada combo.
- Identificador único gerado automaticamente; colisão de identificador, nome duplicado e repetição de
  operação são bloqueados.
- **Cadastrar, editar, duplicar ou desativar um combo não movimenta estoque**, não cria lote e não
  altera preço de categoria.

## Reservas unificadas — regra principal

O Estoque de Salgados continua com **apenas três valores por sabor**: físico, reservado e
disponível, com `Disponível = Físico − Reservado total`.

- O reservado total soma **todas** as origens: venda por sabor, combo fixo, combo personalizado e
  qualquer outro pedido confirmado.
- **Não existem** “reservado em combos”, “reservado avulso”, estoque de combos ou saldo físico de
  combos. A coluna da tabela foi renomeada para **“Reservas (total único do sabor)”** e mostra
  `N pedido(s) · X un. reservadas` — um único número.
- A referência interna do pedido e da origem do combo continua registrada em cada reserva, para
  auditoria e cancelamento, e aparece no histórico do sabor e no histórico de movimentações.
- A tela de Combos mostra quantos combos têm reserva pendente real, lida do Estoque de Salgados.

### Reserva ao confirmar pedido

- Confirmar um pedido calcula a composição por sabor e reserva **uma única vez**: 1 Combo Festa
  100 → 50 coxinhas, 30 bolinhas e 20 kibes; 2 combos iguais → 100, 60 e 40.
- A disponibilidade de **todos** os sabores é verificada antes; se algum falhar, o pedido inteiro é
  rejeitado, sem reserva parcial.
- Confirmação duplicada do mesmo pedido é bloqueada.
- Combo inativo ou quantidade inválida não podem ser confirmados.

### Retirada do freezer — sem baixa dupla

- A retirada reduz o físico do sabor e consome a reserva correspondente uma única vez.
- Exemplo validado no navegador: físico 2.000, reservado 520, disponível 1.480 → após retirar 50
  já reservadas: físico 1.950, reservado 470, disponível **1.480** (inalterado).
- O FEFO continua valendo: a retirada consome o lote com validade mais próxima.

### Cancelamentos

- Cancelar antes da retirada libera a reserva pendente e **não altera o físico**.
- Cancelar depois de retirada libera apenas o que ainda não foi retirado; o que já saiu do freezer
  **não volta ao estoque físico** — exige movimentação específica e conferência.
- A liberação duplicada é bloqueada.

## Compartilhamento de estado

O mesmo provider local é compartilhado por Cadastro de Produtos, Cadastro de Combos e as três telas de
estoque. Na mesma sessão Preview é possível cadastrar um combo, consultá-lo, confirmar um pedido
fictício, abrir o Estoque de Salgados e ver o reservado de cada sabor aumentado, registrar a
retirada e conferir físico/reservado/disponível. **Recarregar a página reinicia a demonstração.**

Não existe um segundo controle paralelo de saldos: combos e produtos compartilham a mesma lista e
os mesmos lotes.

## Testes

| Caso | Resultado |
| --- | --- |
| Cadastrar combo | Chrome: `Combo Demo Reserva`, ID automático `combo-demo-1`, composição 50/30/20 |
| Editar composição | Chrome: nome e quantidades alterados, ID preservado, total continua fechando em 100 |
| Validar soma das quantidades | Chrome: 40+30+20 em total 100 recusado com “A composição soma 90 unidades; deve somar 100” |
| Bloquear sabor inexistente | Teste puro: recusado |
| Reservar por sabor | Chrome: 1 combo → +50/+30/+20; 2 combos → +120/+60/+20 |
| Reservas normais e de combo no mesmo total | Chrome: 350 (inicial) + 50 (avulsa) + 120 (combo) = **520** na única linha |
| Impedir estoque insuficiente | Teste puro e Chrome: pedido inteiro rejeitado, sem reserva parcial |
| Impedir reserva duplicada | Chrome: segundo pedido com a mesma referência é bloqueado |
| Retirar do freezer sem baixa dupla | Chrome: físico 2.000 → 1.950, reservado 520 → 470, disponível 1.480 |
| Cancelar e liberar só a pendente | Chrome: volta a 350/250/300 por sabor, físico intocado; liberado não repõe o retirado |
| Manter FEFO | Teste puro: a retirada consome o lote que vence primeiro |
| Preservar saldo de cada sabor | Teste puro: saldos de todos os sabores conferidos após cada operação |
| Cadastro não movimenta estoque | Chrome e teste puro: nenhum saldo, lote ou total alterado |
| Navegação entre as telas | Chrome: menu mobile abre a página de combos; navegação entre Cadastro de Combos e Estoque de Salgados |

### Comandos

- `npm run typecheck` — passou.
- `npm run build` — passou (client/SSR/Nitro). Avisos não bloqueantes já existentes do projeto sobre
  arquivos auxiliares em `src/routes`, imports dinâmicos e tamanho de chunks.
- `git diff --check` — passou.
- `node scripts/combos-preview.test.mjs` — **14 grupos passaram**.
- `node scripts/estoques-preview.test.mjs` — 14 grupos; `node scripts/cadastros-estoques.test.mjs` —
  7 grupos.
- Regressões de insumos, precificação, reservas, R1, R2-A, Financeiro Premium, Produção, Atendente,
  Central de Entregas e proteção do dev — passaram, sem operações reais.
- `scripts/combos-preview-visual.mjs` — **11 cenários de navegador** e 12 capturas, localmente e no
  Preview publicado, com zero erros JavaScript/HTTP, zero tentativas de acesso ao banco e zero
  requisições de mutação ao servidor.
- `scripts/estoques-preview-visual.mjs` e `scripts/cadastros-estoques-visual.mjs` — repetidos no
  Preview publicado; o primeiro precisou ser ajustado para usar a nova página de combos no lugar do
  antigo modal, mantendo a mesma expectativa de saldo.
- `scripts/reembolsos-estornos-cliente-visual.mjs` — R2-B passou no mesmo Preview.

Evidências: [regras/regressões](regras-regressoes.json), [navegador publicado](vercel/resultado.json),
[regressão dos estoques](regressao-estoques-vercel/resultado.json), [regressão dos cadastros](regressao-cadastros-vercel/resultado.json),
[R2-B](regressao-r2b-vercel/resultado.json), [deployment](deployment.json).

## Capturas reais do Preview publicado

Todas abertas e examinadas. Desktop 1672 × 941; mobile 390 × 844; página completa.

| Tela/evidência | Desktop | Mobile |
| --- | --- | --- |
| Cadastro de Combos | [Abrir](vercel/cadastro-combos-desktop.png) | [Abrir](vercel/cadastro-combos-mobile.png) |
| Estoque de Salgados | [Abrir](vercel/estoque-salgados-desktop.png) | [Abrir](vercel/estoque-salgados-mobile.png) |
| Formulário de criação | [Abrir](vercel/formulario-combo-desktop.png) | [Início](vercel/formulario-combo-mobile.png) · [Final](vercel/formulario-combo-mobile-final.png) |
| Composição consultada | [Abrir](vercel/consulta-combo-desktop.png) | — |

Evidência da reserva unificada: [reserva avulsa](vercel/estoque-reserva-avulsa.png),
[reserva unificada 520](vercel/estoque-reserva-unificada.png),
[retirada sem baixa dupla](vercel/estoque-retirada-sem-baixa-dupla.png),
[cancelamento e liberação](vercel/estoque-cancelamento-liberacao.png).

Na captura da reserva unificada a linha da Coxinha mostra **um único** valor reservado (520) para
**3 pedidos** (inicial + avulsa + combo), sem colunas separadas por origem. Na captura de cancelamento
o valor volta a 350 e o físico permanece 1.950, confirmando que a liberação não repõe o retirado.

## Arquivos alterados nesta etapa

**Criados:**
- `src/components/estoque-preview/combos.ts` — motor puro de combos (cadastro, validação, preço,
  confirmação de pedido) sem banco.
- `src/components/estoque-preview/tela-combos.tsx` — página do Cadastro de Combos.
- `src/routes/preview/_estoques/combos.tsx` — rota `/preview/combos`.
- `scripts/combos-preview.test.mjs` — 14 grupos de regras.
- `scripts/combos-preview-visual.mjs` — 11 cenários de navegador e 12 capturas.
- `docs/estoques/combos/` — relatório e evidências, sem sobrescrever as entregas anteriores.

**Modificados:**
- `src/components/estoque-preview/salgados.ts` — `ReservaDemo.origemId` e a origem textual da reserva;
  a fórmula de saldo e as regras de FEFO/cancelamento foram preservadas.
- `src/components/estoque-preview/tela-salgados.tsx` — coluna “Reservas (total único do sabor)”,
  origem do combo no histórico e texto de ajuda sobre o total único.
- `src/components/estoque-preview/contexto.tsx` — estado de combos no provider compartilhado.
- `src/components/estoque-preview/shell.tsx` — “Combos” vira item de navegação para a nova rota; o
  modal antigo foi removido.
- `src/components/estoque-preview/compartilhados.tsx` — `Campo` aceita `step` numérico.
- `src/components/estoque-preview/estoques.css` — classes `est-combo-*` de composição.
- `src/lib/preview-estoques.ts` — `/preview/combos` na allowlist exata.
- `src/routeTree.gen.ts` — gerado automaticamente pelo TanStack.
- `scripts/estoques-preview-visual.mjs` — a regressão usa a nova página de combos.

**Preservados:** Cadastro de Produtos, Estoque de Insumos, Estoque de Embalagens, componentes
administrativos, estilos globais, catálogo real, checkout, “Monte seu combo”, R1, R2-A e R2-B.

## Git e segurança

- [Git status completo](git-status.txt) com todo o trabalho preexistente.
- Baseline de 185 arquivos locais: **176 intactos, nove alterações autorizadas acima, zero ausentes**
  (SHA-256 em [preservacao-arquivos.json](preservacao-arquivos.json)).
- Nenhum stage, commit ou push; branch e HEAD aprovados preservados.
- Nenhuma alteração em `.env`, migrations, permissões, dados do Supabase, produtos reais ou código dos
  módulos administrativos aprovados.
- Production antes/depois: **`erp-neia-salgados-q9gvt9i8m-luiz988061337-3147s-projects.vercel.app`**,
  `READY`, `target: production`, `createdAt: 1794479879887`. Nenhum deployment ou promote Production.

**Aguardando aprovação visual do proprietário. Nenhuma integração operacional real foi iniciada.**
