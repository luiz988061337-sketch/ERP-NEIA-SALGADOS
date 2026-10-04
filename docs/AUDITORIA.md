# Auditoria completa da experiência do cliente — Néia Salgados

Data: 2026-10-03 · escopo: app Lovable (`main`), banco Supabase `iqirsunzgavsuhgyjjsi`

**Método:** leitura do código de cada rota/componente, execução real dos testes
(`scripts/auditoria.test.mjs`), typecheck, build e smoke test com servidor de pé
(`npm run smoke`). Nada aqui é suposição: cada linha de "CORRETO" foi verificada
em código ou em execução.

---

## CORRETO (verificado em código e em execução)

- **Fórmula única de total** — `src/lib/totals.ts:calcTotals` = `subtotal + taxa − desconto`.
  É a mesma função no carrinho, checkout, admin, atendant e WhatsApp. Teste: `40 + 6 = 46`.
- **Regra dos 50 (frontend e backend)** — validada em `checkout.tsx` antes do insert
  (`isMultiploCombo`) e no `lib/totals`. Congelados/kits/bebidas ficam de fora
  (`tipoVendaProduto` → `unidade`).
- **Catálogo** — nome, descrição, foto, preço,promoção riscada, unidade de venda e
  botão desabilitado quando `estoque <= 0` (`product-card.tsx:23`).
- **Busca** — filtra por nome e descrição, com estado vazio próprio.
- **Favoritos** — persistem no banco por usuário logado (`favoritos` por `user_id`),
  optimistic update com `invalidateQueries`, funciona no card e na aba Favoritos.
- **Repetir pedido** — `conta.tsx:montarItens` **não copia preço antigo**: busca o
  produto, checa `disponivel`/`estoque`, recalcula com `precoFinal` e separa
  indisponíveis/mantidos com aviso ao cliente.
- **Carrinho** — subtotal, entrega, desconto e total com `calcTotals`; cupom com
  progresso para o mínimo; sugestões por coocorrência.
- **Entrega e retirada** — `tipo_entrega` gravado, taxa 0 na retirada, endereço da
  loja no checkout e no acompanhamento, pedido de retirada fora da fila do motoboy.
- **Agendamento** — valida data futura com 30 min de antecedência; nunca inventa horário.
- **Cancelamento** — só pelo próprio cliente em `recebido`, com botão e aviso.
- **Estados vazios** — carrinho, pedidos, favoritos, busca, clientes e orçamentos
  têm mensagem própria (nenhum "undefined" na tela).
- **RLS** — policies por dono (`auth.uid()`) em pedidos, favoritos, endereços,
  orcamentos, notas; escrita de admin via `has_role`. Sem `service_role` no cliente.
- **Sem módulo de eventos** — não existe e não foi criado nada do tipo.

## CORRIGIDO (problema real encontrado e ajustado)

1. **A regra dos 50 era furada no catálogo** — `ProductCard` chamava `add()` sem a
   flag `combo` e com 1 unidade. Era possível comprar **1 coxinha**.
   Agora o catálogo entra com 50 e o botão mostra `+50un`.
2. **Preço de combo gravado errado** — `/combo` salvava o preço *total* com
   `quantidade: 1`; o subtotal ficava correto só por acaso e o stepper do carrinho
   multiplicava por 50 a partir de 1. Agora grava preço unitário + quantidade real.
3. **Regra dos 50 só validada no `/combo`** — `carrinho` (sugestões), `conta`
   (repetir) e `atendente` (pedido rápido) aceitavam 1, 60, 77. Agora
   `ajustarParaCombo` (em `totals.ts`) é aplicado em **todas** as entradas do carrinho.
4. **Carrinho permitia 51/60/70** — só bloqueava abaixo de 50. Agora arredonda para
   múltiplo de 50 sempre.
5. **QR Pix não funcionava** — era texto solto
   (`NEIA-SALGADOS|CHAVE:...|VALOR:...`) desenhado pelo `api.qrserver.com`:
   **nenhum app de bank lê aquilo**. Agora é BR Code EMV real (TLV + CRC16), com
   **Pix Copia e Cola**, valor e chave corretos.
6. **Chave Pix por e-mail quebrada** — o `@` era removido do payload
   (achado ao inspecionar o BR Code gerado). Corrigido e travado por teste.
7. **Pagamento misturado com pedido** — não existia status de pagamento; agora há
   `pagamento_status` + `pagamento_em`, migration `0022`, badge no cliente e
   select no admin. Cliente **nunca** marca o próprio pagamento como pago.
8. **Retirada mostrava etapas de motoboy** — "Saiu para entrega" para quem vai
   retirar. Agora o fluxo muda: "Pronto para retirada" / "Retirado na loja".
9. **Erro técnico vazava na tela** — `toast.error(error.message)` podia mostrar
   `constraint violation`, `column "x" does not exist`, `undefined`. Agora
   `mensagemDeErro()` traduz para frase simples, preservando erros de negócio.
10. **`.env` versionado no git** — removido do índice, `.env.example` criado.
11. **Foto da capa cortada** — era `object-cover` (sumia lateral). Agora a foto
    entra inteira com fundo desfocado da própria imagem; o escurecimento cobre só
    o lado do texto.
12. **Div quebrado na home** — quando outro commit introduce um JSX sem fechar, o
    build quebrava. Detectado e corrigido; build e smoke voltam a passar.

## MELHORADO

- **Calculadora de quantidade** — a sugestão deixa claro que 450 vira 500 por causa
  do múltiplo de 50, **sem alterar o pedido**; mostra "faltam X para fechar a caixa".
  Na busca do cardápio, o `+` já entra em 50 e avisa onde vai fechar.
- **Home** — linha de atalhos (Fazer pedido, Calcular quantidade, Repetir pedido,
  Favoritos, Meus pedidos, WhatsApp) sem poluir a página; o atalho de WhatsApp
  some se o telefone não estiver cadastrado, em vez de quebrar.
- **Carrossel** — upload com redimensionamento sem corte, prévia, editar/trocar
  slide sem perder ordem, e exclusão apaga o arquivo do storage.
- **Pedido do cliente** — mostra endereço da loja, referência, instruções e o mapa
  da loja no pedido de retirada.

## IMPLEMENTADO (não existia)

- `scripts/smoke.mjs` + `npm run smoke` — sobe o servidor, visita 7 rotas e falha
  se alguma quebrar ou se um texto obrigatório sumir do HTML.
- `scripts/gerar-verificacao.mjs` — `PASSO-7` compara o banco com as 26 tabelas /
  254 colunas que o app usa, derivado do próprio `types.ts`.
- `src/lib/erros.ts`, `src/lib/pix.ts`, `ajustarParaCombo` em `totals.ts`.
- Migration `0022` (status de pagamento) e o gerador de migrations em lote.

## DEPENDE DE CONFIGURAÇÃO

- **Chave Pix real** — `PIX_CHAVE` em `checkout.tsx:26` é `neiasalgados@pix.com.br`,
  que parece exemplo. **Trocar pela chave real da conta** ou o QR vai para a conta errada.
- **WhatsApp da loja** — `/admin` → **Loja** (também usado como contato do orçamento).
- **Endereço e mapa da loja** — `/admin` → **Loja** (CEP busca o endereço, "Achar no
  mapa" geocodifica). Sem isso, a retirada diz "confirme pelo WhatsApp".
- **Categorias e produtos** — `PASSO-9` cria as 5 categorias e 21 produtos com os
  preços do código; rodar no SQL Editor.
- **Motoboys** — tabela vazia; cadastrar em `/admin` → Motoboys.
- **Migrations** — `0022` (pagamento) ainda precisa ser aplicada; `PASSO-10`.

## PROBLEMAS ENCONTRADOS (não corrigidos)

1. **`PIX_CHAVE` parece valor de exemplo** (§12) — risco de receber em conta errada.
2. **QR Pix depende de terceiro** (`api.qrserver.com`) — o payload (chave + valor)
   sai do navegador para um serviço externo. functioning, mas é vazamento de dado
   financeiro. Resolve com biblioteca local de QR.
3. **Pagamento é confirmado na mão** — não há PSP/ webhook.while o cliente pagou,
   o status fica "pendente" até a loja marcar. É o comportamento correto (nunca
   marcar sozinho), mas exige processo manual.
4. **Estoque não baixa sozinho** — o carrinho não reserva nem desconta; quem
   controla é o admin.
5. **`lint` está inútil no repo inteiro** — ~15.500 erro do prettier (CRLF vs LF).
   Não rodei `--fix` para não reescrever 111 arquivos de uma vez.
6. **Conta sem recuperação de senha validada** — GO-LIVE pede teste de e-mail; não
   foi possível testar sem e-mail real.
7. **`clientes.tsx` ainda mostra nome de migration** em toast de erro (tela de
   admin, não de cliente).

## TESTES EXECUTADOS

| Suíte | Resultado |
|---|---|
| `node scripts/auditoria.test.mjs` | **168 passaram, 0 falharam** |
| `npx tsc --noEmit` | sem erros |
| `npx vite build` | sem erros |
| `npm run smoke` | 7/7 rotas HTTP 200 |

Cobertura nova desta rodada:

- **Quantidades** — 1, 10, 49, 50, 51, 60, 70, 77, 80, 90, 99, 100, 110, 149, 150,
  200, 201 → sempre múltiplo de 50, nunca abaixo de 50
- **Congelados** — `unidade` não passa pela regra dos 50
- **Valores** — 40+6=46, taxa 1x, entrega grátis, desconto, desconto limitado ao
  subtotal, total nunca negativo, strings numéricas
- **Pix** — payload `000201`, BR.GOV.BCB.PIX, moeda 986, país BR, valor `540546.00`,
  CRC16 válido, e-mail preservado, chave vazia/inválida não gera BR Code
- **Mensagens** — constraint, column, duplicate key, undefined, NaN, uuid, PGRST,
  rede → frase simples; erro de negócio passa intacto
- **Estimativa** — 30×15=450; 30×17=510 sugere 550 e informa 40 que faltam

**Não testei em navegador real** (toque, scroll, teclado, leitor de tela). Os itens
de responsividade e acessibilidade abaixo são leitura de código, não medição.

## PENDÊNCIAS

1. Trocar `PIX_CHAVE` pela chave real.
2. Rodar `PASSO-10` (pagamento) e `PASSO-9` (cardápio) no SQL Editor.
3. Preencher `/admin` → **Loja** (endereço, WhatsApp, mapa) e **Motoboys**.
4. Decidir sobre o QR de terceiro (item 2 dos problemas).

## RECOMENDAÇÕES

1. **Configurar um PSP com webhook** (Mercado Pago/Pagar.me) para o pagamento virar
   automático — hoje é manual e é o maior atrito do fluxo.
2. **Reservar estoque ao fechar o pedido**, senão o cliente vê "esgotado" depois de
   pagar.
3. **Normalizar as quebras de linha** (`.gitattributes` com `* text=auto eol=lf` +
   `git add --renormalize .`) para o `lint` voltar a servir de porta de qualidade.
4. **Rodar `npm run smoke` no CI** antes de cada deploy — hoje ele roda só manual.

## O QUE MEXEI

- **Páginas:** `index`, `calculadora`, `checkout`, `carrinho`, `conta`, `combo`,
  `atendente`, `admin`, `pedido.$id`, `clientes` (só leitura)
- **Componentes:** `product-card`, `status-steps`, `hero-carousel`, `hero-slide-admin`,
  `site-header`, `cart-dock` (leitura)
- **Libs:** `cart`, `totals`, `catalog`, `format`, `pix` (novo), `erros` (novo),
  `loja` (novo), `cep` (novo), `calculadora-salgados`, `upload-imagem` (novo)
- **Tabelas:** `pedidos` (+2 colunas), `loja_config` (nova), `calculadora_config`
  (+2), `orcamentos` (+1), `hero_carousel`, `motoboys`, `storage.buckets`
- **RLS:** `hero_carousel`, `calculadora_config`, `motoboys`, `loja_config`,
  `storage.objects` (bucket `hero`) — todas com policy nova e `has_role`
- **APIs:** nenhuma chamada de servidor nova; nenhuma Edge Function alterada
- **Integrações:** WhatsApp (link com BR Code), Google Maps (geocoding e mapa)
- **Variáveis:** nenhuma nova obrigatória; `.env` saiu do git e virou
  `.env.example`