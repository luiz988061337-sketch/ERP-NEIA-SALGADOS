# Lote 06 — autorizacao de RPCs, exclusivamente local

Base: homologacao-finalizacao, HEAD 1c9a1b8f0e7d9f0b9dafdcb99517b666a54f221f.
Nao modifica lotes 00-05, migrations historicas, layouts, App, job ou dados hospedados.
Nenhum commit, push, deploy ou autorizacao remota A-F faz parte desta entrega.

## Chamadores e implementacao

- receber_compra_item: chamador direto em src/components/admin/estoque/compras-admin.tsx:148.
  O corpo do snapshot nao possui a guarda da 0083; o lote antepoe autorizacao
  admin/financeiro. Nao reexecuta a 0083 nem altera calculos, defaults ou assinatura.
- consumir_insumos_pedido: sem chamador direto encontrado em src/scripts/Edge Functions.
  O trigger consumir_insumos_pedido_trigger chama a rotina. O corpo original e
  copiado sem alteracao para neia_operacao.consumir_insumos_pedido_interno(uuid),
  sem EXECUTE para PUBLIC/anon/authenticated/service_role. A RPC publica exige
  admin/financeiro/producao; o adaptador de trigger chama o worker privado como dono.
  Adaptador necessario e limitado a destino da chamada, NEW.id e retorno NEW.
  Nao usa pg_trigger_depth como autorizacao nem concede permissoes a aplicacao.
- enfileirar_cupom: chamadas por trg_pagamento_confirmado e trg_gerar_cupom_apos_itens;
  checkout cita a funcao apenas em comentario. A fila continua no servidor.
  A guarda exige pedido proprio ou papel admin/financeiro/producao/atendente,
  ou contexto service_role confiavel. O EXECUTE service_role existente e preservado.
- gerar_cupons_pedidos_pagos: sem chamador direto encontrado no frontend ou servicos
  versionados; permanece manutencao administrativa, agora com guarda admin.
  Nao abre EXECUTE a service_role: esse grant nao existia no pos-05 e nao ha
  chamador comprovado que justifique cria-lo. Servico de fila foi testado separado.
- Sessao SQL do dono: somente role=none e session_user com USAGE em postgres.
  Nao testa current_user (que vira o dono em DEFINER). O teste com SET ROLE de
  baixo privilegio, mesmo originado do administrador local, comprova as negacoes.
  O pre-check recusa donos diferentes de postgres antes da adaptacao.

O runner conserva OID, dono, assinatura, defaults, retorno e ACL das cinco funcoes
publicas envolvidas. Nas tres guardas, remover o bloco marcado devolve o hash do
corpo anterior; o worker tem o hash exato do consumo anterior. As outras 91 funcoes
publicas, incluindo processar_lembretes, mantem seus metadados e hashes.

## Matriz de chamadas diretas

Antes: os quatro EXECUTEs eram concedidos a authenticated sem guardas internas
especificas; no processamento global, o guard de pedidos podia limitar efeitos.
Depois (comprovado em PostgreSQL com claims sinteticas):

| Contexto | Compra | Consumo publico | Impressao de terceiro | Global |
|---|---|---|---|---|
| anon | nega | nega | nega | nega |
| cliente | nega | nega | nega; proprio permitido | nega |
| atendente | nega | nega | permite | nega |
| producao | nega | permite | permite | nega |
| financeiro | permite | permite | permite | nega |
| administrador | permite | permite | permite | permite |
| service_role | nega por ACL existente | nega por ACL existente | permite | nega por ACL existente |
| authenticated sem claims | nega | nega | nega | nega |

O worker privado e negado a todos esses oito contextos de aplicacao. Triggers
legitimos continuam executando como dono, sem depender do EXECUTE do usuario final.

## Resultados reais — 18/11/2026

Evidencia final privada: complemento-resultados/complemento-20261118-171402.json,
status APROVADO. O runner injeta o lote 06 ANTES de U1-U9 e das suites seguintes.
Usa o driver 05 aprovado em memoria, com hash fixado, sem editar nenhum arquivo 05.
O portao antigo pre-05 e pulado explicitamente; nao conta como regressao pos-06.

- Lote 04: T1-T6 e sondas de integridade aprovados.
- Lote 05 depois do 06: U1-U9, A1-A5 e matriz das sete tabelas aprovados.
- 13 suites SQL funcionais aprovadas; 14 verificacoes reais de concorrencia aprovadas.
- Nova matriz: 40 casos (32 chamadas das quatro RPCs + 8 negacoes do worker privado).
- Compras autorizadas: duas entradas de 1 kg; chamadas negadas nao mudam os saldos.
- Atendente libera pela RPC existente; Producao altera status e o trigger real
  consome 5 kg. Consumo publico autorizado/repetido registra apenas outra baixa de 5 kg.
  Saldo conferido: 100 + 2 - 5 - 5 = 92 kg. Nao se amplia RLS para permitir UPDATE da atendente.
- Impressao automatica, cliente dono, terceiro negado, service_role recriando trabalho,
  rotina global administrativa e reimpressao autorizada com retry conferidos.
- Compra invalida desfaz a chamada; fixtures da suite inteira terminam em ROLLBACK.
- Aplicar 06 duas vezes preserva o catalogo. Contratos, ACLs, corpos e job conferidos.
- Node: 9 verificacoes do lote; 20 de insumos; 25 de impressao; 26 de producao;
  12 do complemento. Typecheck aprovado. Build nao repetido: nenhum frontend alterado.

Houve duas interrupcoes anteriores na montagem do teste, preservadas nos registros
170720 e 171030: primeiro, postgres restaurado nao podia assumir service_role;
depois, UPDATE direto da atendente afetava zero linhas por RLS. Corrigiu-se somente
o runner/fixture: sessao administrativa de laboratorio para SET ROLE e fluxo real
atendente -> RPC -> Producao -> trigger. Nenhuma permissao operacional foi afrouxada.
Os clusters dessas tentativas foram parados e preservados; o cluster final foi
parado/removido pelo procedimento seletivo ja aprovado. Nada ficou em execucao.

## Limites e proximo passo

Auth/GoTrue, PostgREST, JWT assinado, impressora fisica e integracoes externas NAO
foram homologados por estes testes. A guarda service_role pressupoe claims
autenticadas pelo servidor. Nao foi feito login nem acesso a Supabase hospedado.

Os algoritmos legados de recebimento e insumos foram preservados: estes testes
nao comprovam concorrencia de todos os casos desses algoritmos. As 14 verificacoes
concorrentes sao as suites existentes, identificadas na evidencia, sem ampliar a
declaracao de atomicidade. Correcoes historicas 0083/0094 nao sao presumidas aplicadas.

Revisar localmente este lote antes de qualquer commit. Depois, preparar artefato
hospedado separado, com pre-check de corpos/assinaturas/ACLs/chamadores, rollback
restrito e autorizacao especifica. O SQL atual tem guarda LOCAL e nao deve ser
enviado ao Supabase. O plano P1 corrigido esta em P1-PARCEIROS-PLANO-REVISADO.md;
nao altera o job, nao reabre M24 e nao concede nenhuma autorizacao A-F.

Para reproduzir: usar PowerShell 7, executar executar-lote06.ps1 com
-PrivateStatePath apontando para o estado privado revisado e -Port 55506 livre.
O manifesto proprio confere os arquivos novos e o driver 05; o driver confere
tambem seus 36 arquivos e os 13 do lote anterior antes de criar o cluster.

## Trabalho concorrente preservado

A conferencia final encontrou alteracoes que NAO existiam no inicio desta fase:
src/components/map-view.tsx, src/env.d.ts, src/integrations/supabase/client.server.ts,
src/integrations/supabase/client.ts, src/routes/__root.tsx e o novo arquivo
src/lib/demo-preview.ts. Seus horarios coincidem com a execucao (17:13-17:16).
Nao foram produzidos, revisados nem incorporados ao lote 06. Nenhum foi alterado
ou descartado por esta fase. O typecheck foi repetido diante desse drift.

O indice segue vazio e o HEAD nao mudou. Os 279 arquivos nao rastreados iniciais,
as cinco modificacoes historicas e esse trabalho concorrente foram preservados.
O lote 06 acrescenta somente seus sete arquivos, sem commit.
