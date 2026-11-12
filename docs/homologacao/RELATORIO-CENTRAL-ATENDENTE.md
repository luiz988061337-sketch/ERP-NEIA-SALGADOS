# RELATÓRIO — Central de Pedidos da Atendente (referência aprovada)

Data: 2026-11-12 · Branch: `homologacao-finalizacao` · SHA do código: `2659345`

---

## 1. Preview

| Item | Valor |
|---|---|
| **URL** | `https://erp-neia-salgados-oybpb91ri-luiz988061337-3147s-projects.vercel.app` |
| **ID do deploy** | `dpl_7nKZM7QTauzRzhTyPncNm7H35YWE` |
| **Target** | `preview` — **NÃO é Production** |
| **SHA do deploy = SHA local** | ✅ `26593455c662fdbe24fb15ed924ebb1b2e3834be` |
| Rota de conferência | `/preview-l2-atendente` (Preview com Vercel Authentication → entre na Vercel) |
| **Production intacta** | ✅ `dpl_DK144zp5kG9FSsL4J5HdniQ34Ukk` · `main` @ `366074f` |

---

## 2. O que foi entregue

A rota `/atendente` deixou de mostrar o kanban antigo de 4 colunas e passou a exibir a
**Central de Pedidos da Atendente**, no padrão da imagem de referência aprovada:
três colunas, cartões escuros com borda dourada, cabeçalhos coloridos, métricas no topo,
filtros e alerta sonoro.

### Colunas (3 — conforme a referência)

| Coluna | Cor | Quem entra | Regra real usada |
|---|---|---|---|
| **Em análise** | dourado `#B8862B` | pedidos novos, aguardando a atendente | `status = recebido` **e** `aceito_em_atendente` vazio |
| **Em produção** | azul `#2563EB` | aceitos e em preparo na cozinha | `status = recebido` (já aceito) **ou** `status = em_producao` |
| **Pronto para entrega** | verde `#1E9E63` | prontos para despacho ou retirada | `status = pronto` |

> Nenhum status novo foi criado. A classificação usa exatamente os estados já
> existentes em `pedidos.status` e o marcador real `pedidos.aceito_em_atendente`
> (migration `0084_etapas_operacionais.sql`), e bate com a visão canônica do
> projeto em `src/lib/sincronizacao-paineis.ts` (`visaoAtendente`) — validado em teste.

### Cabeçalho e métricas

- Cabeçalho "PEDIDOS — CENTRAL DA ATENDENTE" com selo verde **Atendimento online**.
- 4 métricas (na referência): **Novos pedidos** · **Em produção** · **Prontos** · **Ticket médio**.
- Em telas pequenas as métricas passam a **1 coluna** (antes ficavam truncadas em 2 colunas).

### Filtros e busca

- Busca por **nº do pedido** ou **nome do cliente**.
- Filtros: **Todos** · **Entrega** · **Retirada** · **Agendados**.
- Botão **Testar som** (libera o áudio bloqueado pelo navegador).

### Cartão do pedido

Número · cliente · chip de modalidade (Retirada/Entrega) · total · status do pagamento
(PIX/CREDITO pago × Aguardando pagamento) · horário ou agendamento · itens · tempo
aguardando (só em "Em análise") · observações · aviso da cozinha · botões
**Ver detalhes** · **Aceitar pedido** · **Acompanhar preparo** · **Chamar motoboy** ·
**Liberar retirada** · **Reconhecer alerta**.

> Os botões abrem a ficha do pedido; **nenhum botão grava status novo**. As transições
> continuam pertencendo às ações canônicas (aceite da atendente, liberação para a
> cozinha e o fluxo de entrega). O botão "Aceitar pedido" fica desabilitado quando a
> regra real de aceite (`elegivelAceiteLocal` em `src/lib/atendente-aceite.ts`) recusa.

### Avisos da cozinha no card

Avisos reais da tabela `notificacoes` (`pedido_pronto_caixa` e
`pedido_liberado_retirada`) aparecem dentro do card do pedido — ex.: *"Pedido #4587
liberado para retirada — Cliente: Luciana Melo"*. O vínculo é feito pelo **UUID real**
do pedido extraído do link do aviso.

### Detalhe do pedido

Modal com cliente, modalidade, total, pagamento, recebido em, agendado, endereço,
observações e a lista de itens.

---

## 3. Alerta sonoro (aprovado pelo proprietário)

| Parâmetro | Valor | Onde |
|---|---|---|
| Ativo | ✅ sim | `CONFIG_ALERTA_PADRAO.ativo` |
| Volume | **75%** | `CONFIG_ALERTA_PADRAO.volume = 0.75` |
| Repetição | **a cada 30s** | `CONFIG_ALERTA_PADRAO.intervaloSegundos = 30` |
| Reconhecimento | **individual por pedido** | botão "Reconhecer alerta" no card |

Comportamento implementado:

- O som dispara para pedidos **novos** que aparecem na coluna "Em análise".
- **Não toca retroativamente** ao abrir/recarregar a página: na primeira leitura os
  pedidos existentes são registrados como "conhecidos" sem bip (flag `primeiraLeitura`).
- **Reconhecimento é por pedido**: reconhecer um pedido silencia só ele; os demais
  continuam pedindo alerta.
- **Um único timer** reavalia a lista a cada 30s — sem loops aninhados nem sons
  simultâneos.
- Configuração e reconhecimentos são **persistidos em `localStorage`** (chaves
  `neia:central-pedidos:alerta`, `:reconhecidos`, `:conhecidos`), logo recarregar a
  página não duplica o alerta.
- Botão **Testar som** para desbloquear o áudio em navegadores que bloqueiam
  autoplay — o mesmo padrão já usado na Produção.

---

## 4. Menu (sem duplicar "Atendimento")

- **Nenhum menu novo.** A Central usa o `AdminShell` já aprovado no Dashboard, PDV e
  Produção — mesma largura, logotipo, ordem, ícones, cores, bordas, espaçamento e rodapé.
- O item **"Pedidos"** do menu passa a ficar em pílula dourada quando a rota
  `/atendente` está aberta (mapa `ROTA_PARA_ABA` em `src/components/admin/admin-shell.tsx`).
- O módulo **Atendimento** não foi duplicado: `/atendente` continua sendo o mesmo
  item de menu, agora apontando para a Central.
- O formulário **"Novo pedido"** da rota `/atendente` foi preservado (botão "+ Novo Pedido").

---

## 5. Regras de negócio preservadas

- Nenhum status novo, nenhuma coluna nova, nenhuma migration.
- Nenhuma escrita no backend a partir da Central: a tela é de leitura, com os
  avisos reais da cozinha.
- Pagamento, aceite, liberação, conferência e retirada continuam nos módulos e RPCs
  originais (`aceitar_pedido_atendente`, `liberar_pedido_cozinha`, `conferido_em`).
- A classificação das colunas foi confrontada com `visaoAtendente` (visão canônica
  do projeto) e com `elegivelAceiteLocal` (política de aceite e pagamento).

---

## 6. Testes

| Teste | Resultado |
|---|---|
| `npm run typecheck` | ✅ sem erros |
| `npm run build` | ✅ client 27,2s · ssr 23,0s · nitro 6,3s |
| `npm run teste:guard` | ✅ 41/41 |
| `npm run teste:producao` | ✅ todos os testes passaram |
| `npm run teste:central` | ✅ todos os testes passaram (novo) |
| `git diff --check` | ✅ sem erros de whitespace |
| Visual desktop | ✅ `central-atendente-desktop.png` |
| Visual mobile | ✅ `central-atendente-celular.png` (390×844) |
| Operações com escrita | ✅ nenhuma — a conferência usa fixtures locais |

Cobertura do `scripts/central-pedidos.test.mjs`: mapeamento das 3 colunas
(inclui a concordância com a visão canônica), busca e filtros, prioridade/ordenação,
contadores e ticket médio, detecção de pedido novo pelo ID real, reconhecimento
individual, configuração do alerta (padrão 75%/30s + normalização fora de faixa),
filtro dos avisos da cozinha e extração do UUID real do pedido, e as regras de
aceite já existentes (aceite duplicado e fora de "Novos" bloqueados).

---

## 7. Arquivos alterados

| Arquivo | Alteração |
|---|---|
| `src/lib/central-pedidos.ts` | **novo** — regras puras: colunas, filtros, prioridade, métricas, configuração do alerta, persistência, avisos da cozinha |
| `src/components/central-pedidos.tsx` | **novo** — a tela da Central (3 colunas, métricas, filtros, alerta sonoro, cards, modal de detalhe) |
| `src/routes/preview-l2-atendente.tsx` | **novo** — rota de conferência com fixtures fictícias (nenhuma escrita) |
| `src/routes/atendente.tsx` | passa a renderizar `<CentralPedidos/>`; formulário "Novo pedido" preservado |
| `src/components/admin/admin-shell.tsx` | `ROTA_PARA_ABA` → `/atendente` destaca "Pedidos" (sem criar menu) |
| `scripts/central-pedidos.test.mjs` | **novo** — suíte da Central (`npm run teste:central`) |
| `scripts/captura-central.mjs` | **novo** — captura desktop/mobile + acionamento do "Testar som" |
| `scripts/capturar-preview.mjs` | nome de arquivo da rota `/preview-l2-atendente` no espelho do Preview |
| `package.json` | script `teste:central` |
| `src/routeTree.gen.ts` | rota gerada automaticamente |

---

## 8. Preservação dos módulos já aprovados

- **Dashboard/Gestão** ✅ intacto — `docs/erp-dark/prints/gestao-PREVIEW-desktop.png`
- **PDV/Balcão** ✅ intacto — `docs/erp-dark/prints/pdv-PREVIEW-desktop.png`
- **Produção/Cozinha** ✅ intacto — `docs/erp-dark/prints/producao-PREVIEW-desktop.png`
- **Production** ✅ inalterada (`dpl_DK144zp5kG9FSsL4J5HdniQ34Ukk` / `main` @ `366074f`)

---

## 9. Capturas

Todas capturadas **do Preview hospedado** (deploy `dpl_7nKZM7QTauzRzhTyPncNm7H35YWE`),
na rota `/preview-l2-atendente` — com o tema escuro/dourado, o menu `AdminShell` e os
cards renderizados pelo bundle publicado.

| Arquivo | Conteúdo |
|---|---|
| `docs/erp-dark/prints/central-atendente-PREVIEW-desktop.png` | Central da Atendente — desktop 1440×1000 (Preview hospedado) |
| `docs/erp-dark/prints/central-atendente-PREVIEW-celular.png` | Central da Atendente — mobile 390×844 (Preview hospedado) |
| `docs/erp-dark/prints/central-atendente-desktop.png` | Central da Atendente — desktop 1600×1000 (render local do mesmo commit) |
| `docs/erp-dark/prints/central-atendente-celular.png` | Central da Atendente — mobile 390×844 (render local) |

### Verificação do alerta sonoro

O botão **"Testar som"** foi acionado programaticamente na página do Preview
(`scripts/captura-central.mjs`): o clique foi confirmado no DOM
(`botao 'Testar som' clicado = true`), liberando o `AudioContext` que o navegador
bloqueava por falta de interação do usuário. O alerta de pedido novo é disparado
automaticamente a cada 30s enquanto houver pedido não reconhecido em "Em análise",
e o botão **"Reconhecer alerta"** silencia apenas o pedido escolhido.

### Módulos já aprovados, conferidos no MESMO Preview

| Módulo | Captura do Preview | Situação |
|---|---|---|
| Dashboard/Gestão | `gestao-PREVIEW-desktop.png` | ✅ intacto |
| PDV/Balcão | `pdv-PREVIEW-desktop.png` | ✅ intacto |
| Produção/Cozinha | `producao-PREVIEW-desktop.png` | ✅ intacto |

---

## 10. Pendências de integração real

1. **Confirmação do vínculo com a cozinha:** os avisos exibidos vêm da tabela real
   `notificacoes`; é preciso confirmar, com a Production, o formato exato do campo
   `link` usado pela cozinha para que o UUID do pedido seja reconhecido (o regex
   atual espera `?pedido=<uuid>`).
2. **Comportamento do som com o navegador em primeiro plano:** o áudio depende de
   interação prévia do usuário na aba — o botão "Testar som" cobre esse caso.
3. **Central de Entregas:** módulo ainda **não autorizado** nesta etapa — nenhuma
   alteração foi feita nele.

---

**Etapa encerrada. Aguardando aprovação visual da Central da Atendente.**
