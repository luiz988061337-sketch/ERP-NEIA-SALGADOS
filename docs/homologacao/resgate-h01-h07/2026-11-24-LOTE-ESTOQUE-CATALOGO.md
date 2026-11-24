# Resgate visual — Lote Estoque e Catálogo (24/11/2026)

## Escopo

Apenas o lote **Estoque e Catálogo** das telas administrativas. Não houve nova auditoria das 76 telas:
foram reaproveitadas as auditorias e capturas já registradas em `docs/homologacao/resgate-h01-h07/`.

| Item | Valor |
| --- | --- |
| Referência aprovada | commit `1dc0e0d0c0ddd7c008628f473d33799136d689e2` · deployment `dpl_2wgqFWijouXrgqcfuLDAVsVEqExZ` |
| Baseline operacional | branch `resgate-visual-h01-h07-codex` @ `7d2ed2df1b0a075ae83bd038141cd48184aa4a08` |
| Worktree | `C:\Users\User\ERP-NEIA-RESGATE-WT` (branch de resgate, separada do worktree original) |
| Ambiente | Preview de homologação; `main`, Production, migrations, RLS e dados reais intactos |

## Correções aplicadas

### `src/routes/admin.tsx` — Cadastro de Produtos

- Faixa de abas interna, com **Cadastro de Produtos** ativo e atalho para **Estoque de Salgados**
  (navegação real pela aba já existente; não é link para tela fictícia).
- Cabeçalho, cinco indicadores e filtros preservados.
- Tabela alinhada à referência: `Produto / identificador`, `Categoria`, `Preparo`,
  `Modalidade comercial`, `Preço`, `Situação`, `Ações`.
- Preço exibido por unidade avulsa e situação textual ao lado do interruptor real.
- Estoque passou a constar na identificação do produto; alerta de mínimo preservado.

### `src/components/admin/estoque/salgados-admin.tsx` — Estoque de Salgados

- Indicadores renomeados para `Total físico`, `Total reservado`, `Total disponível`,
  `Abaixo do mínimo` e `Lotes ativos`, com os mesmos detalhes da referência aprovada.
- Filtro `Apenas abaixo do mínimo` alinhado ao aprovado, mantendo o seletor de status.
- Colunas da tabela renomeadas para `Físico (un.)`, `Reservas (total único do sabor)`, `Lotes`.
- Reservas clicáveis abrem o detalhe do sabor; ações de olho/lápis preservam o fluxo real
  (detalhe local e ida para o cadastro, respectivamente).
- Detalhe do sabor com ícone, categoria em badge, imagem do cadastro único e saldos em cartões.
- Consulta ajustada para trazer lotes e reservas sem filtros que suprimissem registros:
  o filtro de reserva ativa e de lote com saldo positivo passou a ser feito no mapeamento,
  mantendo as mesmas regras de cálculo de FEFO, disponibilidade e pedidos.

**Preservado:** hooks, consultas Supabase, RLS, ações de estoque, permissões, botões operacionais,
FEFO, reservas, perdas, inventário, compras e integrações. Nenhuma tela funcional foi trocada por mockup.

## Validação executada

| Verificação | Resultado |
| --- | --- |
| `npm run typecheck` | passou |
| `npm run build` | passou |
| `node scripts/estoques-preview.test.mjs` | passou (E1/E2/E3, reserva, FEFO, perdas e inventário) |
| `node scripts/cadastros-estoques-visual.mjs` (build local de demo, 4183) | passou — 4 rotas, 8 capturas, zero erro de página, zero chamada ao banco, zero mutação |
| `node scripts/estoques-preview-visual.mjs` (build local de demo, 4183) | passou — salgados/insumos/embalagens em desktop e celular sem overflow, zero chamada externa |
| `node scripts/resgate-capturas-lote.mjs` | 18 capturas, zero erro de página, zero requisição ao Supabase |

Os testes visuais usaram build local com `VITE_DEMO_PREVIEW=1`, dados fictícios e interceptação de rede:
**nenhuma operação foi gravada no Supabase de homologação nem no de produção**.

## Capturas

Pasta: `docs/homologacao/resgate-h01-h07/validacao-lote-estoque-catalogo/`

- Comparativos lado a lado (APROVADO / ANTES / DEPOIS):
  `comparativo-produtos-desktop.png`, `comparativo-produtos-celular.png`,
  `comparativo-estoque-salgados-desktop.png`, `comparativo-estoque-salgados-celular.png`,
  `comparativo-preview-estoque-salgados-desktop.png`, `comparativo-preview-estoque-salgados-celular.png`.
- Individuais: `aprovado-*`, `antes-*`, `depois-*` para desktop (1440×1000) e celular (390×844).
- Evidência de navegação: `navegacao-cadastros/resultado.json` e `fluxos-estoque/resultado.json`.
- Metadados: `resultado.json`.

As capturas APROVADO foram geradas do commit `1dc0e0d` e as ANTES do commit `7d2ed2d`, ambas em build
local idêntico ao DEPOIS (mesmo modo demo e mesma resolução), para que a diferença visual venha apenas do código.

## Commits e publicação

- Correção de código: (preenchido após o commit)
- Evidências e relatório: (preenchido após o commit)
- Preview da branch: (preenchido após a publicação)

## Situação

**Aguardando conferência do proprietário.** Este documento registra a execução do lote, não uma aprovação final.
