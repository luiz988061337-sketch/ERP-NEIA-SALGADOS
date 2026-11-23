# Validações físicas e presenciais (checklist de campo)

Documento de preparo. Nada foi testado em hardware; nenhum provedor foi
contatado. Levar este checklist para a loja e executar na ordem, com dados
reais somente onde indicado. Interromper qualquer item em caso de dúvida.

## 0. Estado atual no código (base do checklist)

- **PSP: ausente.** Não há gateway/PSP contratado. Checkout grava
  `pagamento_status='pendente'` e gera BR Code PIX real em `src/lib/pix.ts`.
  Existe webhook interno protegido em `/api/public/pix/event`: exige aparelho
  cadastrado e token SHA-256; confirma automaticamente apenas quando há um
  único pedido PIX pendente com o mesmo valor; caso contrário registra `CONFERIR`.
- **Impressão:** `fila_impressao` (`0025`: `trabalho_uuid` UNIQUE, `tipo`,
  `payload`, `impressora` default `'Tanca TP-550'`, status
  pendente/enviando/impresso/erro/cancelado, `tentativa`, `ultimo_erro`,
  `reimpressoes`, `imprimir_apos`). Agente `print-agent/agent.ts`: polling
  5s, claim `enviando`, imprime via `imprimir.ps1`/Out-Printer, marca
  `impresso` + `pedidos.impresso`, retry até 5x, presos voltam à fila.
- **GPS:** `motoboy.tsx` usa `watchPosition` em rota (throttle 15s,
  `enableHighAccuracy`, timeout 15s) gravando `motoboy_lat/lng/atualizado_em`;
  `MapView` + link `rotaGoogleMaps`; central mostra última posição e idade.
- **Fiscal:** `fiscal-emitir` emite via provedor com ambientes
  `homologacao`/`producao` (`supabase/functions/fiscal-emitir/index.ts`);
  exige NCM/CFOP por produto (admin, `admin.tsx:1417-1422`, colunas `0033`);
  combos precisam desmembramento (`index.ts:259`); reemissão exige
  `forcar=true`; documento autorizado só cancela na SEFAZ.

## 1. Pagamento presencial (Pix + dinheiro/cartão)

Levar: celular com app do banco, acesso ao admin, um pedido de teste.
1. Criar pedido real pequeno no checkout com Pix → conferir no admin que
   `pagamento_status` nasce `pendente` (nunca `pago` sozinho).
2. Pagar via BR Code exibido → conferir valor/chave no app do banco.
3. Marcar `pago` no admin → conferir badge no pedido e impressão com
   `CONFIRMADO` (vs `PENDENTE_PGTO` no cupom).
4. Testar valor ambíguo: dois pedidos pendentes de mesmo total → confirmar
   que o sistema **não** vincula sozinho; validação humana obrigatória.
5. Cancelar um pedido pendente → conferir que nada foi marcado `pago`.
Critério: nenhum `pago` sem ação manual da loja; cupom reflete o status.

## 2. Impressora Tanca TP-550 (notebook da loja, USB)

Levar: notebook com Windows, cabo USB, papel térmico, acesso ao admin.
1. `Get-Printer` → anotar nome exato/driver/porta; página de teste do
   Windows antes de tudo (`print-agent/README.md` §1).
2. Configurar `.env` do agente **apontando ao staging primeiro** (nunca
   produção nesta fase): URL + service-role **só no agente**.
3. Botão “Testar Impressora” no admin (`tipo='teste'`) → cupom
   NÉIA/TESTE com data-hora legível e sem acentos quebrados.
4. Pedido real → cupom completo (nº, itens, totais, `Cobrar do cliente`
   quando pendente).
5. Desligar a impressora no meio → `erro` + alerta no pedido; ligar →
   recupera sozinho **sem duplicar** (UNIQUE `trabalho_uuid`).
6. Reimpressão → nova linha com `motivo_reimpressao` + contador (nunca
   reusa uuid).
Critério: 1 pedido = 1 cupom correto; falha nunca perde o pedido.

## 3. GPS e entregas (campo, com motoboy)

Levar: 2 celulares (motoboy + cliente), pedido de entrega real.
1. Aceite no `/motoboy` → conferir atribuição na `/central-entregas`.
2. Disputa: 2 motoboys aceitam o mesmo pedido → só 1 vence; outro recebe
   “já foi aceita”.
3. Iniciar rota → posições a cada ~15s no mapa do cliente; conferir
   `motoboy_atualizado_em` (idade da posição).
4. Sem sinal (túnel/modo avião 2 min) → app não quebra; ao voltar,
   retoma sem duplicar; central mostra posição antiga com idade.
5. Finalizar → status `entregue`, WhatsApp ao cliente, ranking/ganhos.
6. Atraso → motivo obrigatório; pedido atrasado sinalizado na central.
Critério: nenhuma posição inventada; sem GPS, sem mapa ao vivo (texto).

## 4. Fiscal e tributário (com o contador)

Levar: CNPJ/IE/CNAE da loja, certificado digital, credenciais do provedor
em **homologação**, NCM/CFOP/CST-CSOSN por produto.
1. Preencher NCM + CFOP de **todos** os produtos no admin (lista marca
   “sem NCM” até completar); CST (lucro real/presumido) ou CSOSN (Simples).
2. Configurar provedor **sempre em homologação primeiro**.
3. Emitir NF-e/NFC-e de teste p/ pedido com item avulso → DANFE válida.
4. Tentar combo avulso (sem produto) → deve **bloquear** com motivo
   (desmembrar ou cadastrar kit).
5. Tentar sem NCM → bloqueio com motivo. Reemitir sem `forcar` → bloqueio
   “documento já existe”. Só virar `producao` com certificado A1 válido e
   DANFE testada.
Critério: nenhum documento `autorizada` sem retorno válido do provedor;
produção fiscal só após contador liberar por escrito.

## 5. Ordem e parada

Pix → Tanca → GPS → fiscal. Qualquer falha de segurança, duplicidade ou
divergência de total **interrompe a sequência**. Registrar nº do pedido,
hora, prints e `ultimo_erro` da fila antes de prosseguir.
