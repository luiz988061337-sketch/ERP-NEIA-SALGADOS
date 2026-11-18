# Finalizacao local das funcoes essenciais — 18/11/2026

## Resultado e limites

Onze assinaturas essenciais concluidas e testadas LOCALMENTE. Nenhuma migration historica foi modificada. O delta e um rascunho incremental guardado contra uso remoto, baseado no backup de 18/11 e no HEAD b684fe985a12b11d108a7f721b048773bb96ea64. Nao e uma autorizacao de implantacao hospedada nem prova de sistema publicado.

| Assinatura | Contrato preservado / verificacao |
|---|---|
| criar_pedido_com_reserva(uuid,text,jsonb,jsonb) | Preco no servidor, combos 50/100, reserva, repeticao e falha com rollback |
| cancelar_pedido_atomico(uuid,text) | Dono/staff, apenas recebido e pagamento pendente; devolve somente saldo nao retirado |
| estornar_conta(uuid,text) | Mesma assinatura void; usa eventos do ledger; nao zera valor_pago diretamente; abertura historica sem parcelas e bloqueada |
| pedido_cobertura_reserva(uuid) | Cobertura e origem do debito comprovadas |
| reservar_pedido_atomico(uuid) | Locks de pedido/produto/reserva e debito logico unico |
| liberar_pedido_atomico(uuid) | Uso interno; sem EXECUTE de authenticated; cancelamento libera apenas o restante |
| registrar_consumo_reserva(uuid,integer,uuid,uuid,text) | FEFO de lotes validos, trilha por lote, sem novo debito de produtos.estoque; repeticao nao retira novamente |
| exigir_reserva_producao() | Trigger quando regime controlado estiver ativo |
| exigir_consumo_producao() | Retirada INTEGRAL, incluindo soma das parcelas; retirada parcial nao libera producao |
| proteger_consistencia_financeira_pedido() | Trigger de consistencia entre subtotal, desconto, frete e total |
| distancia_linha_reta_km(float8,float8,float8,float8) | Dependencia da RPC de frete 0105, calculo e flags explicitas verificados |

O tipo de movimentacao fisica e venda, existente no enum antigo; nao foi inventado saida nem acrescentado valor ao enum. A sobrecarga de registrar_mov_estoque recebe os nove parametros explicitamente e atualizar_estoque=false. O consumo novo recusa regime_controlado_inativo antes de gravar; repeticoes previamente registradas continuam reconhecidas. O helper FEFO legado continua atuando quando o regime estiver desligado; no regime novo a retirada e feita somente pela RPC. Nenhuma flag foi ativada no projeto remoto ou no delta essencial.

Os helpers M24 reservar_estoque_atomica(uuid,uuid,integer) e liberar_reserva_atomica(uuid) permanecem fechados a authenticated. Nao foi reaplicada 0098. Dependencias operacionais selecionadas, correcao do guard de cancelamento do proprio cliente e permissoes apenas das tabelas novas estao separadas em 00-*.sql; nao ha replay das migrations antigas 0001–0104. O incremento do enum contador foi ensaiado localmente em transacao separada, nao aplicado remotamente e nao possui reversao trivial.

## Caixa e Financeiro

O papel legado financeiro continua existindo. A separacao adicional e de capacidade no servidor, com tabela privada neia_operacao.financeiro_capacidades, RLS, sem CRUD/EXECUTE direto para atores da aplicacao. Nenhum usuario antigo recebe capacidade automaticamente. Regras de perfil e de responsavel diferente permanecem nas RPCs.

| Ator sintetico | Capacidades | Acao |
|---|---|---|
| Caixa | conferir_caixa, receber_pagamento | Confere acerto e confirma recebimento de pedido; nao paga conta nem turno |
| Financeiro | executar_financeiro, receber_pagamento | Pagamentos, estornos, conciliacao e movimentos financeiros; nao confere acerto sem capacidade de Caixa |
| Responsavel | Nenhuma capacidade monetaria automatica | Aprova/autoriza pelos contratos existentes, sem confirmar seu proprio pagamento |
| Demais cinco atores | Nenhuma capacidade financeira | Restricoes anteriores mantidas |

Capacidades e concessoes possuem motivo, data e concedido_por. Na fixture sao atribuidas somente aos UUIDs novos atestados por Auth Admin/protocolo. Em operacao futura, nomeacao/revogacao de funcionarios exige decisao explicita e trilha autorizada; nao existe UI nova para isso. Esta camada nao pretende separar toda a leitura financeira legada nem consertar automaticamente todas as policies antigas. Exigir RLS/API representativas antes de publicar.

## Evidencias executadas

| Verificacao | Resultado real |
|---|---|
| PostgreSQL 17.11 nativo, cluster novo em loopback | PASSOU; sem Docker, extensoes novas ou conexoes remotas |
| Base aditiva e 19 migrations 0105–0123 no esquema parcial antigo | PASSOU |
| funcoes-essenciais.test.sql | PASSOU: pedido 50/100, replay/divergencia, reserva/FEFO, vencimento, cancelamento parcial, producao sem retirada/retirada parcial, conclusao, frete minimo/gratis/fora da area/desativado, pagamentos parciais e estorno idempotente |
| Falha obrigatoria no ledger durante criacao e durante retirada | PASSOU: pedido/saldo/lote/consumo revertidos, sem falso sucesso |
| Saldo fisico insuficiente | PASSOU: nenhum consumo gravado |
| Duas sessoes independentes, sete disputas e 14 verificacoes | PASSOU: pagamento, movimento manual, rota, ultimo estoque do checkout, mesmo checkout, mesmo consumo, consumo versus cancelamento; bloqueio real observado por pg_blocking_pids |
| Dez suites SQL existentes | PASSOU: regressoes, rotas-app, inicio-rota-integridade, impressao, fechamento-turno, seguranca-financeira-motoboy, pagamento-turno, liberacao-central, fluxo-completo-rota, motoboy-corte-gps |
| capacidades-integracao.test.sql | PASSOU: fluxo de tres pedidos ate pagamento, atores Caixa/Financeiro diferentes, nega autoatribuicao, Caixa pagando e Financeiro conferindo sem capacidade |
| cliente-isolamento.test.sql | PASSOU: cancelamento proprio e bloqueio de alteracoes protegidas/outro cliente |
| Copia PARCIAL privada com dados antigos + delta | PASSOU: contagens e SHA-256 das colunas originais de 106 tabelas preservados, zero indices/constraints invalidos, Auth anterior intacto, helpers M24 fechados |
| Fixture coexistindo com Auth anterior na copia local | PASSOU: oito contas ficticias novas, nove Auth no total, hash anterior preservado; capacidades corretas nas oito identidades SQL |
| Backup original e copia E: | PASSOU: 12/12 hashes em cada pacote, sem modificar arquivos |
| Runner offline Auth/Preview | PASSOU: 9/9 testes Node com --import tsx; nenhum teste remoto executado |
| App Motoboy | PASSOU: 7/7 contratos, worktree sem alteracoes |
| Criacao atomica e wrappers/reserva | PASSOU: 203 assercoes PGlite/PG18.6 existentes, wrappers e integracao; distinguem-se dos novos testes PG17 com sessoes reais |
| Checkout/frete, producao e conciliacao | PASSOU: tres arquivos de regressao Node focados |
| ERP typecheck | PASSOU: npm run typecheck |
| ERP build Vite + Nitro | PASSOU: destino/chave ficticios, Vite envDir=false, Nitro em raiz nova sem .env; saida final fora do ERP |
| Scan do build | 359 arquivos de texto: zero URLs dos dois projetos protegidos e zero sb_secret; destino ficticio presente |
| Auth/PostgREST hospedados, GPS fisico, gateways e impressora | NAO TESTADOS nesta execucao |

As dez suites antigas usam suas fixtures legadas; as novas suites de reserva usam explicitamente controlado=true e revertem seus dados. Nao se confunde rollback de SQL com desfazer e-mails, arquivos, pagamentos ou outras chamadas externas. Nao houve chamadas externas no laboratorio. Os clusters desta rodada foram encerrados, sem apagar diretorios antigos ou bancos preexistentes.

## Arquivos e reproducao local

Pasta scripts/homologacao-pg17/lfl-finalizacao-0123: 00-dependencias-operacionais.sql, 00-guard-pedido.sql, 00-permissoes-novas.sql, 01-funcoes-essenciais.sql, 02-estorno-compativel.sql, 03-capacidades-financeiras.sql; suites funcoes-essenciais.test.sql, capacidades-integracao.test.sql, cliente-isolamento.test.sql, fixture-coexistencia.test.sql e concorrencia.test.ps1; executar-local.ps1, validar-dados-legados-local.ps1 e ORIGEM.json.

Os runners exigem PowerShell 7, PG17 e o estado privado revisado da restauracao parcial; verificam hashes do lote, copia do dump e lista/roles curados. Nao colocam dumps, dados, senhas ou roles exportados no Git. Por padrao ficam offline. Para repetir SOMENTE se houver alteracao relevante:

~~~powershell
$estado = 'C:\Users\User\Documents\Codex\2026-11-16\code-review-guidelines-coordinate-a-private\work\lfl-ensaio-state.json'
$testes = 'C:\Users\User\ERP-NEIA-SALGADOS\scripts\homologacao-pg17\lfl-finalizacao-0123'
& "$testes\executar-local.ps1" -PrivateStatePath $estado -Executar
& "$testes\validar-dados-legados-local.ps1" -PrivateStatePath $estado -Executar
~~~

Os drivers privados anteriores e logs ficam preservados fora do Git. ORIGEM registra as onze assinaturas e hashes do lote. Nao tentar retirar as guardas locais ou usar esses runners em um banco hospedado.

## Plano unico de homologacao online — PENDENTE DE APROVACAO

1. Autorizar uma janela SOMENTE no candidato lflzlcqinarrcgncafol, incluindo separadamente metadados/read-only, delta revisado, suspensao temporaria do job identificado, oito contas ficticias, fixture e testes de escrita. ruioyioynwwwiqbjznoa e iqirsunzgavsuhgyjjsi permanecem excluidos. Nao utilizar .env produtivo. Nao ha autorizacao remota nesta entrega.
2. Antes da primeira escrita, reconfirmar referencia e consumidores/automacoes ativos; comparar schema, historico de migrations se disponivel, definicoes/ACLs M24, usuario Auth, catalogo de Storage e contagens com o snapshot. Se houver operacao nova ou dependencia ativa desconhecida, PARAR. A fixture recusa pedidos/rotas operacionais preexistentes; nao apagar registros para satisfaze-la. Preservar 31 produtos e demais dados antigos; testes de estoque precisam de produtos/lotes sinteticos novos.
3. Refazer exportacao se o estado tiver mudado; conferir hashes, copia independente e ensaio parcial. Salvar em local privado definicoes/ACLs/policies substituidas e estado do job. Cron/Vault/Realtime, seis event triggers e 22 memberships gerenciadas continuam sem recuperacao integral comprovada. Nao instalar extensoes, extrair segredos Vault ou fazer backup de chaves no Git. O risco residual de recuperacao desses componentes deve ser aceito expressamente antes de alterar o candidato; producao nao fica liberada por esse aceite.
4. Localizar o unico job que chama public.processar_lembretes e verificar suas dependencias e consumidores. Preparar identificador, comando, agenda e active originais em registro privado. Apos autorizacao especifica, suspender SOMENTE seu campo active, exigir exatamente uma linha correspondente e guardar a operacao inversa com active original. Nao unschedule, nao executar o job e nao retomar automaticamente durante testes. Se houver outros jobs ou dependencias externas, parar para revisao.
5. Gerar o pacote hospedado a partir deste delta TESTADO, com precondicoes contra o schema lido, sem remover guardas diretamente dos arquivos locais. Ordem: enum adicional aprovado em transacao propria; base aditiva 29 tabelas/35 colunas e constraints; dependencias/guard selecionados; incrementos aplicaveis 0105–0123; onze funcoes/FEFO/estorno; permissoes novas minimas; capacidades vazias. Nenhum replay cego de 0001–0104, de 0098 ou de migrations ja presentes. Executar o pacote hospedado somente apos sua revisao final por hash e confirmacao. Preservar tabelas antigas/Auth/Storage e grants protegidos; nao substituir toda a seguranca por ACLs do catalogo de referencia.
6. Antes do commit de DDL, validar assinaturas, owners, SECURITY DEFINER/search_path, RLS, grants, constraints, M24 e hashes/contagens originais; erro implica ROLLBACK. Depois do commit, fazer leituras de consistencia antes de qualquer fixture. Ativar regime controlado/corte_rpc apenas no candidato, de maneira coordenada com frontend e proveniencia sintetica validada. Nenhum backfill de reservas/parcelas antigas inventadas.
7. Criar oito contas de teste via Auth Admin real, com UUIDs/email example.invalid e raw_app_meta_data atestados pelo protocolo; preservar o usuario antigo. Nao inserir usuarios manualmente no Auth hospedado. A fixture concede somente quatro linhas de capacidade a Caixa/Financeiro novos; o runner verifica capacidades exatas, marcador, cutover e usuario. Confirmar configuracao offline primeiro; so entao autorizar --executar com NEIA_STAGING_ESCRITAS_AUTORIZADAS igual ao candidato. Login tambem altera metadados Auth e faz parte da autorizacao de escrita, nao do backup read-only.
8. Testar Auth/PostgREST/RLS com oito atores, dois motoboys e acessos negados, Caixa sem pagamento, Financeiro sem conferencia, responsavel distinto, idempotencia, concorrencia e falhas. Nao usar service_role nas operacoes do ERP/App nem senhas reais nos logs. Testes SQL com claims nesta entrega nao substituem essa fase.
9. Somente com aprovacoes anteriores, preparar Preview protegido ERP + App apontando exclusivamente ao candidato. Fluxos obrigatorios: checkout 50/100, retirada gratuita, frete fora de area, agendamento, cancelamento, reserva/FEFO/consumo, cozinha/conferencia, Central atribui/libera, retiradas completas, rota 1–3, entrega individual, retorno, Caixa, responsavel distinto e Financeiro. Simular pagamentos sem gateway real e conferir ledger/caixa/DRE. Incluir falha de rede e repeticao. Produtos antigos nao entram nos testes.
10. Se falhar antes do commit SQL: rollback transacional. Depois de DDL/escritas/Auth/Storage, nao existe rollback automatico completo: bloquear novas operacoes, preservar eventos e registros, reverter apenas definicoes/flags comprovadamente compativeis ou preparar compensacao revisada. Nao fazer DROP de tabelas/usuarios, nao apagar ledger nem restaurar por cima do projeto protegido. Enum acrescentado e efeitos externos exigem tratamento proprio. Reativar o job somente com estado original e autorizacao, depois de retirar protocolos de teste de qualquer automacao.

## Bloqueadores para publicar

- Pacote hospedado com precondicoes do schema ATUAL ainda exige leitura/revisao e autorizacao; arquivos locais possuem guardas de laboratorio. O delta local foi comprovado no snapshot do backup, nao no estado vivo.
- Auth/PostgREST/RLS reais e E2E de navegador ERP/App ainda pendentes; nao existe Preview publicado nesta rodada.
- Recuperacao integral cron/Vault/Realtime e grafo gerenciado nao comprovada. Recuperacao dos dados centrais e Storage exportados nao elimina esse risco.
- Nomeacao de funcionarios reais para capacidades, configuracao efetiva de frete/Pix e rollout de flags exigem validacao operacional; nao inferir permissoes ou credenciais do snapshot.
- Impressora fisica, confirmacao dos meios de pagamento/gateways e GPS nos aparelhos ainda exigem testes. WhatsApp automatico, GPS em segundo plano e empacotamento nativo podem ser adiados somente se o proprietario aceitar esse escopo inicial; nao sao usados para declarar pronta a cadeia financeira.

## Preservacao e consolidacao

ERP em homologacao-finalizacao, HEAD inicial b684fe985a12b11d108a7f721b048773bb96ea64. App em feat/app-motoboy-integracao-m3-a, HEAD d5b68870f04e9440f5c3ca38f18201c6f06838d6, sem alteracao de codigo. AGENTS.md, tres PNGs, supabase/.temp/cli-latest, script commit-seguro e historicos continuam fora do lote. CONTINUACAO e atualizado por acrescimo, preservado fora do commit como nas entregas anteriores. Commit local so depois da confirmacao manual COMMIT exigida pelo procedimento. Nenhum push, deploy, escrita remota, senha ou backup no Git.
