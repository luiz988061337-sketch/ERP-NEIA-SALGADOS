# R2-B — correção visual pública e evidências

## Situação

Preview publicado e validado em Chrome real (headless), com páginas completas em
1440×1024 e 390×844. Não constitui aprovação visual definitiva.

**Pendente:** comparação direta/sobreposição com as duas imagens aprovadas.
Os anexos não estavam disponíveis nesta retomada nem nos arquivos do projeto.
A conferência foi feita com os requisitos escritos, as capturas reais locais e
as capturas do deployment. A aprovação visual cabe ao proprietário.

## Preview

- ID: `dpl_9DLz3Nzaraz7XdajGExgh3uo8jXz`.
- Estado retornado pela Vercel: `READY`; `productionUrl: null`.
- Publicação: `vercel deploy --yes` (sem `--prod`, sem promoção/alteração de aliases de Production).
- [Meus Pedidos](https://erp-neia-salgados-qthjtxak1-luiz988061337-3147s-projects.vercel.app/preview/reembolsos-estornos-cliente)
- [Acompanhe seu pedido](https://erp-neia-salgados-qthjtxak1-luiz988061337-3147s-projects.vercel.app/preview/reembolsos-estornos-cliente/1053)
- Proteção `vercel_authentication` mantida. O proprietário precisa de acesso
  autorizado na Vercel; não foi desativada a proteção do projeto.
- Capturas remotas feitas diretamente na URL HTTPS acima, com cookie temporário
  obtido pelo bypass autorizado de `vercel curl`. Não são capturas de HTML estático.

## Correções

- Causa dos cards pretos: `RootShell` considerava qualquer prefixo
  `/preview/reembolsos-estornos` administrativo, incluindo R2-B. A exceção agora
  é exclusivamente para a página pública R2-B. `erp-dark.css` não foi modificado.
- `.r2b-public` tem cores explícitas para header, footer, cards, campos, filtros,
  botões, ciclo, badges, textos e mapa. CSS próprio compilado via `?url` no layout
  pai; R2-B não requisita `/src/styles-preview.css` em produção.
- Meus Pedidos: fidelidade à direita do título; seis cards brancos horizontais;
  acentos vermelho/laranja; valores vermelhos; status no centro; ações à direita;
  filtros claros; ajuda no rodapé da lista e acompanhamento de solicitações.
- Detalhe: título/fidelidade; ciclo branco; notificações; Resumo/Entrega lado a
  lado; mapa em largura completa abaixo; ajuda abaixo do mapa; ações inferiores.
- Mapa SVG local com ruas, praça, percurso e três marcadores. Sem Google Maps,
  tiles, chave, coordenadas geográficas ou GPS. Legenda explícita:
  “Mapa demonstrativo — localização fictícia”. No celular possui rolagem interna.
- Endereço e consentimento de localização são demonstrações locais. Nenhuma
  localização real é solicitada, armazenada ou transmitida.
- O formulário chama `dadosCliente` (R2-A) e `criarOperacao` (R1), sem duplicar
  regras financeiras. Limite e duplicidade testados na interface. Solicitações
  são visíveis apenas ao cliente fictício, em memória nesta sessão, sem Central
  administrativa. Recarregar completamente a página encerra essa sessão local.
- Repetir pedido abre revisão demonstrativa, sem checkout/compra/cobrança real.
  Cancelamento segue indisponível para o pedido que já saiu para entrega.

## Evidências publicadas

- [Meus Pedidos — desktop](capturas-cliente/preview/meus-pedidos-desktop-1440.png)
- [Acompanhe seu pedido — desktop](capturas-cliente/preview/acompanhe-pedido-desktop-1440.png)
- [Meus Pedidos — celular](capturas-cliente/preview/meus-pedidos-mobile-390.png)
- [Acompanhe seu pedido — celular](capturas-cliente/preview/acompanhe-pedido-mobile-390.png)
- [Resultados e CSS computado do Preview](capturas-cliente/preview/resultado.json)
- [Resultados locais](capturas-cliente/local/resultado.json)

As duas capturas desktop publicadas foram abertas e inspecionadas. O navegador
confirmou `erp-admin: false`, header branco, todos os seis cards `rgb(255,255,255)`
e fundo `rgb(250,249,246)`. Na largura 1440, Resumo e Entrega têm 571px cada,
na mesma linha; mapa e ajuda têm 1160px. Não há lista dentro do detalhe.

## Testes executados

| Verificação | Resultado |
| --- | --- |
| `npm run typecheck` | Passou |
| `npm run build` | Passou (avisos existentes de chunks grandes/arquivo de rota auxiliar) |
| `node scripts/reembolsos-estornos.test.mjs` | R1: 27 verificações passaram |
| `node --experimental-loader ./scripts/alias-loader.mjs scripts/reembolsos-estornos-origens.test.mjs` | R2-A: 14 verificações passaram |
| `node scripts/reembolsos-estornos-cliente-visual.mjs` | R2-B local: 8 grupos de verificações passaram |
| Mesmo script contra o novo HTTPS | R2-B publicado: 8 grupos passaram |
| `git diff --check` | Passou |
| Diff dos arquivos R1/R2-A, `erp-dark.css`, Supabase e `.env` | Nenhuma alteração |

R2-B testa: filtros 6/1/4/1; navegação Ver pedido e carregamento direto;
repetição demonstrativa; posições e fundos computados; quatro informações do
rastreamento; ausência de Google Maps; endereço local; aceitar/recusar
consentimento sem GPS; limite R1; duplicidade; acompanhamento da solicitação;
duas telas mobile sem overflow; menu mobile. Zero erros JS, zero requisições ao
banco/Google Maps e zero respostas HTTP de erro no Preview.

## Arquivos envolvidos nesta retomada

Modificados:

- `src/routes/__root.tsx` — exceção de tema somente para R2-B.
- `src/routes/preview.tsx` — layout público demonstrativo sem sessão/banco.
- `src/styles-preview.css` — preservado escopo anterior, seletor de fundo corrigido.
- `src/routes/preview/reembolsos-estornos-cliente.tsx` — pai/Outlet preservado; CSS e provider local.
- `src/routes/preview/reembolsos-estornos-cliente/index.tsx` — lista pública.
- `src/routes/preview/reembolsos-estornos-cliente.$id.tsx` — detalhe público.
- `src/routes/preview/reembolsos-estornos-cliente/novo.tsx` — formulário público com validação R1 reutilizada.
- `src/routeTree.gen.ts` — árvore gerada, estrutura pai/index/$id/novo preservada.

Adicionados:

- `src/components/reembolsos-estornos/cliente-publico.css`.
- `src/components/reembolsos-estornos/cliente-publico.tsx`.
- `src/components/reembolsos-estornos/cliente-mapa.tsx`.
- `src/components/reembolsos-estornos/cliente-sessao.tsx`.
- `scripts/reembolsos-estornos-cliente-visual.mjs`.
- Este relatório e `docs/reembolsos-estornos/capturas-cliente/{local,preview}/`.

## Preservação

Após esta entrega chegou o resultado atrasado do subagente iniciado antes da
retomada direta. Ele sobrescreveu somente o arquivo de detalhes localmente.
O rascunho foi preservado em
`C:\Users\User\AppData\Local\Temp\opencode\r2b-detalhe-retorno-antigo-preservado.tsx`.
A versão testada foi recuperada do código-fonte do próprio deployment acima,
com SHA-1 `d08ea6ad8ee83d5d4f4789150eb812bc85536abe`. Os 12 arquivos de aplicação
envolvidos foram conferidos por hash e estão idênticos ao Preview publicado.
Typecheck, diff-check e os oito grupos de teste R2-B passaram novamente após
a recuperação. O script agora aguarda os handlers React antes de interagir,
evitando cliques perdidos enquanto o HTML SSR ainda hidrata no servidor dev.
Nenhum novo deploy foi necessário e nenhum novo subagente foi iniciado.

- Branch: `homologacao-finalizacao`; HEAD permanece `123c9a2`.
- Sem commit, stage, push, reset ou descarte do trabalho anterior.
- Arquivos R2-B continuam não rastreados como estavam, além dos novos componentes
  e evidências; arquivos já modificados permanecem no working tree.
- Prints/documentos/logs preexistentes não foram sobrescritos nesta retomada.
- Production conferida antes/depois: continua `READY` em
  `erp-neia-salgados-q9gvt9i8m-luiz988061337-3147s-projects.vercel.app`,
  `createdAt: 1794479879887`.
- Supabase, migrations, `.env`, AdminShell e regras/fontes de R1/R2-A intactos.
- Nenhum pagamento, estorno ou GPS real executado. Nenhum início de R2-C.
