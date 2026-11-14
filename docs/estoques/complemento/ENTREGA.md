# Complemento E1 + E2 + E3 — Cadastro de Produtos funcional

## Resultado

O item **Produtos → Cadastro de Produtos** agora abre a página independente `/preview/cadastro-produtos`, não o antigo modal de referência. A página permite cadastrar, pesquisar, consultar, editar e ativar/desativar produtos fictícios. O cadastro é a mesma lista de produtos usada pelo estoque, vinculada por ID; não foi criado outro cadastro real.

As quatro telas foram publicadas no mesmo Preview e testadas novamente no Chrome **depois da publicação**.

- Deployment: **`dpl_HiA3zom5ALmky7zxiGDgQoKcGBqr`**.
- `vercel inspect`: **READY**, `target: preview`.
- Comando: `vercel deploy --yes`, sem `--prod`.
- Proteção **Vercel Authentication** mantida. Pode exigir login em conta autorizada; cookies da automação ficaram somente no diretório temporário, fora do projeto.
- Branch: `homologacao-finalizacao`.
- HEAD mantido: `673a0c98e4452a608cfe5f3065712ffa6cc0709a`.

## URLs completas

1. **Cadastro de Produtos:** https://erp-neia-salgados-1pbkr90ho-luiz988061337-3147s-projects.vercel.app/preview/cadastro-produtos
2. **Estoque de Salgados:** https://erp-neia-salgados-1pbkr90ho-luiz988061337-3147s-projects.vercel.app/preview/estoque-salgados
3. **Estoque de Insumos:** https://erp-neia-salgados-1pbkr90ho-luiz988061337-3147s-projects.vercel.app/preview/estoque-insumos
4. **Estoque de Embalagens:** https://erp-neia-salgados-1pbkr90ho-luiz988061337-3147s-projects.vercel.app/preview/estoque-embalagens

## Inspeção e reutilização

- `ProdutosAdmin`, em `src/routes/admin.tsx`, é um cadastro operacional que grava no Supabase. Seus campos e modalidades comerciais foram inspecionados, mas o componente não foi montado ou alterado.
- `src/routes/preview/admin/produtos.tsx` era uma demonstração estática com botões sem ações; foi preservada e não é utilizada por este novo fluxo.
- O antigo modal “referência única” de `shell.tsx` era apenas uma consulta. Foi substituído pelo link para a nova rota no mesmo layout TanStack `_estoques`.
- Os cadastros locais de insumos/embalagens já existiam. Foram reutilizados, com melhor acesso ao botão de insumo, campo de tipo de embalagem e normalização contra duplicidades.
- Reutilizados sem alterações: `EstoquesProvider`, `ModuleHeader`, `MetricCard`, `SectionCard`, `DarkTable`, `DarkTableRow`, `StatusBadge`, `ActionButton`, `Dialog`, `Input`, `Label` e os campos/modais compartilhados da demonstração.
- Modalidades `unidade` e `combo_50` seguem o tipo existente em `catalog.ts`; o tamanho de 50 reutiliza `PASSO_COMBO` de `totals.ts`.
- Conforme o checkout existente, o preço direto/avulso pertence ao produto; o preço de um combo montado pertence à categoria, não a um estoque/preço independente de cada sabor. A tela distingue ambos, usando valores de categoria fictícios. Não modifica precificação, promoções ou categorias reais.

## Funcionamento

### Produtos

- Página com o AdminShell real, indicadores, busca por nome/sabor/ID, filtro ativo/inativo, tabela e botão **+ Cadastrar Produto**.
- Formulário: nome, categoria, sabor, classificação do item, frito/assado/outro, descrição, preço direto, modalidade comercial, mínimo e ativo/inativo.
- ID automático, não editável pelo formulário. Colisão de ID bloqueada no motor puro; nomes duplicados bloqueados mesmo com diferenças de caixa, acentos ou espaços.
- Ações de consulta, edição e ativar/desativar na tabela. Inativar não apaga estoque/histórico; novas reservas de item inativo são bloqueadas.
- Novo salgado: físico **0**, reservado **0**, disponível **0**, sem lote. Nenhuma quantidade é inserida pelo cadastro.
- Entrada é uma operação separada: botão **Registrar entrada de estoque**, seletor de produto já cadastrado, quantidade, lote, validade e referência.
- Bebidas e outros itens não classificados como salgados congelados ficam fora da tabela, dos indicadores e do seletor de entrada de salgados; o motor também bloqueia movimentação/reserva indevida.
- Produto que já tem lotes/reservas não pode ser reclassificado de modo a ocultar seu estoque.

### Insumos e embalagens

- **Cadastrar Insumo** disponível no cabeçalho, com nome, unidade de compra, equivalente, fornecedor, custo e mínimo.
- **Cadastrar Embalagem** reutiliza o formulário existente, agora com tipo (caixa/sacola/pote/guardanapo/outra); unidade de compra limitada a fardo, pacote ou unidade e conteúdo configurável.
- Cadastro reaparece imediatamente na lista, inclusive se havia busca/filtro anterior. Entradas, retiradas e edição usam o mesmo item/ID; editar não altera o físico.
- Caixas de 50 e 100 continuam com cadastros, custos e saldos separados.

### Estado demonstrativo

O mesmo provider local é compartilhado pelas quatro rotas. Navegar pelo menu mantém os itens e saldos na mesma demonstração; **recarregar a página reinicia os exemplos**. Isso é identificado na tela. Não há escrita em banco nem persistência de dados reais.

## Comprovação dos testes

| Caso pedido | Resultado |
| --- | --- |
| Cadastrar novo sabor | Chrome: `Mini Coxinha de Palmito DEMO`, ID automático `produto-demo-1` |
| Bloquear identificador duplicado | Teste puro rejeita colisão de ID, ID vazio, edição de ID inexistente e repetição da operação |
| Editar cadastro | Chrome: mesmo ID, nome alterado para `Mini Coxinha de Palmito DEMO Premium` e preço direto de R$ 1,90 para R$ 2,10 |
| Ativar/desativar | Chrome: ação direta na tabela, filtro de inativos e reativação passaram |
| Consultar/pesquisar | Chrome: busca por palmito e consulta exibindo o mesmo ID |
| Novo sabor no estoque | Chrome: mesmo ID, `0 / 0 / 0`, nenhum lote |
| Registrar entrada separada | Chrome: 150 unidades, lote `PAL-CAD-DEMO`, validade 15/12/2026 |
| Conferir saldo | Chrome: `150 / 0 / 150`, um lote e histórico de entrada |
| Não misturar bebida | Chrome cadastra `Suco de teste DEMO`; ausente da tabela e do seletor de salgados |
| Novo insumo | Cadastro, compra de 3 pacotes de 5 kg, retirada de 1: saldo 10 kg; edição preserva o físico |
| Nova embalagem | Cadastro, fardo configurado com 36, compra de 3 e retirada de 1: saldo 72 un.; edição preserva o físico |
| Duplicidades | Produto, insumo e embalagem duplicados foram rejeitados pela interface; motor também testado |
| Estado compartilhado | Retorno ao cadastro e ao estoque mantém IDs, cadastro e saldo 150 |
| Sem banco | Zero tentativas Supabase/Lovable Cloud e zero requisições de mutação ao servidor do Preview |

O primeiro cadastro foi confirmado com viewport **mobile**, além das ações desktop. O formulário mobile foi verificado quanto a overflow e rolado até o botão Salvar.

### Comandos e regressões

- `npm run typecheck` — passou.
- `npm run build` — passou, client/SSR/Nitro. Mantém avisos não bloqueantes do projeto sobre rotas auxiliares e chunks/imports.
- `git diff --check` — passou.
- `node scripts/cadastros-estoques.test.mjs` — **7 grupos passaram**.
- `node scripts/estoques-preview.test.mjs` — **14 grupos passaram**.
- Regressões de insumos, precificação, reservas, R1, R2-A, Financeiro Premium, Produção, Atendente e Central de Entregas — passaram, sem execução de operações reais.
- `cadastros-estoques-visual.mjs` — passou localmente e no Preview publicado; **16 capturas por ambiente**, zero erros JavaScript/HTTP e zero acesso ao banco.
- `estoques-preview-visual.mjs` — passou localmente e no Preview, preservando os fluxos de reservas, FEFO, compras, retiradas, conferências e reposição.
- `reembolsos-estornos-cliente-visual.mjs` — R2-B passou localmente e no Preview, inclusive identidade pública branca e comportamento anterior.

Evidências: [regras/regressões](regras-regressoes.json), [navegador publicado](vercel/resultado.json), [regressão dos estoques](regressao-estoques-vercel/resultado.json), [R2-B](regressao-r2b-vercel/resultado.json), [deployment](deployment.json).

## Capturas reais do novo Preview

As capturas de cadastro, formulário, evidências do novo saldo e das três telas de estoque foram **abertas e examinadas**, não somente geradas. Desktop: viewport 1672 × 941; mobile: 390 × 844. Capturas de página completa; formulários longos rolam internamente.

| Tela/evidência | Desktop | Mobile |
| --- | --- | --- |
| Cadastro de Produtos | [Abrir](vercel/cadastro-produtos-desktop.png) | [Abrir](vercel/cadastro-produtos-mobile.png) |
| Formulário preenchido | [Abrir](vercel/formulario-produto-desktop.png) | [Início](vercel/formulario-produto-mobile.png) · [Final/Salvar](vercel/formulario-produto-mobile-final.png) |
| Estoque de Salgados | [Abrir](vercel/estoque-salgados-desktop.png) | [Abrir](vercel/estoque-salgados-mobile.png) |
| Estoque de Insumos | [Abrir](vercel/estoque-insumos-desktop.png) | [Abrir](vercel/estoque-insumos-mobile.png) |
| Estoque de Embalagens | [Abrir](vercel/estoque-embalagens-desktop.png) | [Abrir](vercel/estoque-embalagens-mobile.png) |

Prova do novo item: [consulta](vercel/consulta-produto-cadastrado.png), [estoque inicialmente zerado](vercel/novo-salgado-estoque-zero.png), [entrada e saldo 150](vercel/novo-salgado-entrada-150.png).

Cadastros adicionais: [insumo após compra/retirada](vercel/cadastro-insumos-compra-retirada.png), [embalagem após compra/retirada](vercel/cadastro-embalagens-compra-retirada.png).

## Arquivos criados e modificados neste complemento

**Criados:**
- `src/components/estoque-preview/produtos.ts`.
- `src/components/estoque-preview/tela-produtos.tsx`.
- `src/routes/preview/_estoques/cadastro-produtos.tsx`.
- `scripts/cadastros-estoques.test.mjs`.
- `scripts/cadastros-estoques-visual.mjs`.
- `docs/estoques/complemento/` — relatório e evidências, sem sobrescrever a entrega anterior.

**Modificados em relação ao início deste complemento:**
- `src/components/estoque-preview/salgados.ts` — campos de cadastro, classificação e restrições de reserva/movimento.
- `src/components/estoque-preview/shell.tsx` — navegação para a página, removendo somente o modal substituído.
- `src/components/estoque-preview/tela-salgados.tsx` — link para cadastro, seletor de entrada e classificação dos itens.
- `src/components/estoque-preview/suprimentos.ts` — tipo/unidades de embalagem e duplicidade normalizada.
- `src/components/estoque-preview/tela-suprimentos.tsx` — acesso ao cadastro, tipo de embalagem e exibição após salvar.
- `src/lib/preview-estoques.ts` — nova rota na allowlist exata, ainda isolada de autenticação/banco operacionais.
- `src/components/admin/admin-shell.tsx` — apenas o teste da allowlist de navegação em Preview, para permitir a nova rota. Nenhuma classe/layout alterado.
- `src/routeTree.gen.ts` — gerado automaticamente pelo TanStack.
- `scripts/estoques-preview-visual.mjs` — regressão agora verifica a página de cadastro, não o modal antigo.

**Preservados:** `estoques.css`, `contexto.tsx`, componentes administrativos, estilos globais, cadastro operacional, catálogo real e módulos aprovados. As mudanças de composição visual nos estoques limitam-se aos controles solicitados; não houve novo tema, nova sidebar ou redesenho das tabelas/cards.

## Git e segurança

- [Git status completo](git-status.txt), incluindo todo o trabalho preexistente.
- 117 arquivos locais na baseline deste complemento: **108 intactos, nove alterações autorizadas acima, zero arquivos ausentes**. Conferência SHA-256: [preservação](preservacao-arquivos.json).
- Nenhum stage, commit ou push. Branch e HEAD aprovados preservados.
- R1, R2-A e R2-B sem edição de seus arquivos; regressões passaram.
- Nenhuma alteração em `.env`, migrations, permissões, dados de Supabase, produtos reais ou código dos módulos administrativos aprovados.
- Production antes/depois permanece **`erp-neia-salgados-q9gvt9i8m-luiz988061337-3147s-projects.vercel.app`**, `READY`, `target: production`, `createdAt: 1794479879887`. Nenhum deployment/promote Production executado.

**Aguardando aprovação visual do proprietário. Não foi iniciada integração operacional ou outra etapa.**
