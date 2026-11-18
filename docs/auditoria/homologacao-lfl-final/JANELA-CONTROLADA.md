# Janela controlada — preparo e bloqueio de leitura atual

Referencia exclusiva: lflzlcqinarrcgncafol. Fontes do commit d9905e7f5acb3f544c162f08248b577d0a100bd3. Nenhuma escrita remota autorizada ou executada; nenhum push/deploy. Projetos ruioyioynwwwiqbjznoa e iqirsunzgavsuhgyjjsi fora de qualquer operacao.

## Estado comprovado nesta rodada

- Plano anterior lido, Git conferido, fontes do SQL comparadas com o commit e hashes registrados. Nao foram repetidos testes de negocio, typecheck ou builds aprovados: nao houve alteracao funcional.
- Uma unica conexao PostgreSQL de leitura ao host exclusivo db.lflzlcqinarrcgncafol.supabase.co:5432, usuario postgres, banco postgres, TLS verify-full, retornou **password authentication failed**. Nao houve nova tentativa, recuperacao de credenciais, prompt de senha ou SQL remoto concluido. As consultas tinham READ ONLY, timeout de 8 s e lock timeout de 2 s; nao chamam RPC operacional.
- Supabase passou a constar como adicionado na sessao, mas suas ferramentas de consulta ainda nao foram disponibilizadas. Instalacao nao e prova de acesso ao projeto. Falta concluir/disponibilizar a conexao para prosseguir pelas leituras JA autorizadas.
- Portanto, **NAO confirmado** o uso atual, as conexoes, automacoes, execucoes do job ou o schema vivo. Dados de backup nao provam ausencia de consumidores ativos.

## SQL identificado, mas ainda nao liberado para execucao hospedada

SQL-INCREMENTAL-MANIFESTO.json enumera 26 fontes SQL com ordem e SHA-256, mais o incremento condicional do enum contador. Hash do manifesto: 8762910c4955e178e5959e485ffcaf38a5909a5b39df02038ed924283abc180d.

Escopo: base de 29 tabelas/35 colunas/quatro enums; dependencias operacionais selecionadas e guard do cliente; incrementos 0105–0123; onze funcoes e estorno por ledger; grants minimos das 29 tabelas novas; tabela privada de capacidades Caixa/Financeiro inicialmente vazia. Nenhuma tabela antiga, usuario ou arquivo Storage deve ser apagado, e nenhum grant M24 deve ser reaberto.

**Isso nao e um pacote SQL remoto executavel.** As fontes conservam guardas locais, BEGIN/COMMIT internos e testes de laboratorio. E necessario ler o catalogo vivo, conferir o baseline MD5 e objetos/ACLs, gerar um derivado com precondicoes especificas e revisar/testar seus limites transacionais. Nao remover guardas dos originais, concatenar scripts com commits internos nem aplicar roles/ALTER OWNER globais do laboratorio. Se o catalogo divergir, parar e recalcular somente o delta necessario. O enum contador requer commit antes de ser usado e nao tem down automatico; nao atribuir esse papel a usuarios antigos.

## Job e menor primeira escrita proposta — AINDA NAO AUTORIZADA

Somente no backup coletado em 18/11/2026 as 07:16:18 -03:00: job **1**, agenda **0 12 * * *** (12h no fuso do scheduler, ainda a confirmar), ativo. Comando reconhecido: SELECT public.processar_lembretes(). SHA-256 original 8FE93C32AD8B7D62880EE192D1A0EEFA50D33AA6189060D05C1DAAB33D076C6A. Extracao apenas do arquivo local, sem carregar cron ou executar o job.

A funcao insere pedido_lembretes para janelas de 7 dias, 3 dias, 24h e dia do pedido, excluindo entregues/cancelados, com ON CONFLICT (pedido_id,tipo) DO NOTHING. Nao ha HTTP/Vault no corpo nem trigger dessa tabela no snapshot. Isso nao exclui consumidores externos, polling ou Realtime. A pausa pode atrasar lembretes e perder janelas temporais se for longa; reativar nao equivale a recompor automaticamente todas as janelas perdidas.

**Outro risco comprovado no backup:** processar_lembretes possui EXECUTE para PUBLIC, anon e authenticated. Pausar cron nao impede chamadas manuais/API dessa funcao. Sua exposicao atual e eventuais consumidores precisam ser lidos; nao chamar a RPC para testar leitura. Se for necessario restringir invocacoes, preparar e autorizar uma mudanca de grants especifica, com antes/depois e compensacao, sem afrouxar M24.

Depois de confirmar ao vivo o job, fuso, comando, dono, permissao de alteracao e ausencia de execucao em andamento, a primeira escrita proposta e mudar **somente active de true para false** desse job. Conferir identificador/agenda/hash/estado anterior sob lock, exigir uma unica correspondencia, abortar em divergencia. Usar somente o mecanismo de alteracao cuja assinatura e permissao forem confirmadas. Nao unschedule, nao modificar comando/agenda e nao cancelar processos.

Rollback dessa operacao: restaurar o active anterior SOMENTE se identificador, agenda e comando ainda coincidirem; nunca ativar um job que era inativo. A autorizacao A deve incluir esse retorno em caso de aborto. A pausa do agendador nao exige, por si, parar o site, mas nao e possivel prometer indisponibilidade zero sem conhecer consumidores. A escrita sera limitada a 8 s/lock 2 s, se esses limites forem mantidos; a duracao da pausa sera a janela aprovada, nao um prazo de execucao garantido. Migrations e testes nao fazem parte da autorizacao A.

## Preservacao, seguranca e recuperacao

| Momento | Verificacao obrigatoria |
|---|---|
| Antes de qualquer escrita | Referencia, consumidores ativos, catalogo/versao/historico real, baseline e objetos, Auth/Storage, RLS/grants M24, jobs e funcoes invocaveis; backup atualizado se houver mudanca |
| Antes/depois da pausa | Identidade/hash/agenda/active e execucoes em andamento; depois, apenas o campo autorizado mudou e nao ha nova execucao iniciada |
| Antes do delta | Derivado SQL final com hash aprovado, limites transacionais testados, owners/perfis confirmados, snapshot de definicoes/ACLs substituidas e plano de recuperacao por componente |
| Antes do commit de DDL | Constraints/indices, assinaturas, RLS/SECURITY DEFINER/search_path, M24, contagens e hashes originais; erro implica rollback da transacao em curso |
| Depois do delta | Colunas/linhas antigas, Auth/Storage, grants protegidos, novas capacidades vazias e flags inativas; nenhuma automacao acionada; reconfirmar invariantes sem RPC de escrita |
| Antes/depois dos oito usuarios | Protocolo e UUIDs novos atestados, Auth Admin autorizado; preservar todos os usuarios anteriores, nao presumir oito usuarios globais nem apagar dados para satisfazer a fixture |
| Antes/depois da fixture/testes | Escopo sintetico, dados/estoque separados dos 31 produtos antigos, identidades e capacidades exatas, Auth/API nao privilegiada, idempotencia e ledger; nao reaplicar fixture global nem limpar historico para repetir o fluxo |

Na fixture, Caixa recebe conferir_caixa/receber_pagamento; Financeiro recebe executar_financeiro/receber_pagamento. O responsavel aprova como pessoa distinta e nao ganha capacidade de pagar automaticamente. A camada protege operacoes, nao separa automaticamente toda a leitura financeira legada. API real deve comprovar as negacoes.

O ensaio anterior comprovou restauracao PARCIAL das 106 tabelas e preservacao dos registros antigos no delta local. Nao comprovou recuperacao integral de cron, Vault, Realtime, seis event triggers, 22 memberships gerenciadas, configuracao Auth, servico Storage ou integracoes externas. Os tres binarios Storage exportados nao provam restauracao funcional do servico hospedado. Nao extrair segredos Vault nem alterar extensoes para contornar isso.

Antes do commit SQL, rollback cobre somente aquela transacao. Commits de enum e efeitos de outras fases nao se revertem automaticamente. Depois de novas escritas, preferir congelar operacoes e correcao incremental revisada; restaurar funcoes antigas nao pode reintroduzir baixas diretas inseguras nem perder ledger. Nao usar DROP, restauracao sobre producao, exclusao de usuarios ou limpeza de eventos como rollback. Retorno de job e compensacao de API/Storage sao procedimentos separados.

**Conclusao de recuperacao:** suficiente como evidencia do subconjunto SQL/dados ensaiado e para continuar preparacao/leitura. Insuficiente como garantia de recuperacao completa ou como liberacao de uma atualizacao ampla do candidato. No estado atual, consumidores e catalogo nao confirmados somam risco inaceitavel para recomendar escrita. Reavaliar esse julgamento depois da leitura atual e de um plano de reversao especifico do derivado final; nao autorizar producao com base somente no ensaio parcial.

## Autorizacoes independentes e homologacao preparada

1. **A — job:** pausa condicional e retorno ao estado original; sem SQL funcional, usuarios, fixture ou publicacao.
2. **B — delta:** somente pacote final revisado por hash/precondicoes; enum e seus limites explicitados. Sem usuarios/testes de escrita.
3. **C — Auth:** oito contas ficticias identificadas via Auth Admin; nenhuma alteracao no usuario anterior.
4. **D — fixture e testes:** produtos/lotes/pedidos sinteticos, papeis/capacidades apenas das contas novas, ativacoes coordenadas somente no candidato, Auth/PostgREST/RLS e E2E. Login tambem altera metadados e pertence a esta autorizacao.
5. **E — Preview:** publicacao de homologacao isolada, sem variaveis/servicos produtivos.
6. **F — producao/cutover:** aprovacao final distinta, depois de recuperacao e homologacao adequadas.

E2E preparado: checkout 50/100, frete/retirada/agendado/cancelamento; reserva e retirada FEFO; cozinha/conferencia; Central atribui/libera; motoboy retira todos/inicia/entrega individualmente/retorna; Caixa confere; responsavel distinto aprova; Financeiro confirma. Incluir oito atores, outro motoboy, chamadas diretas negadas, concorrencia, replay, falha e rollback. Usar o runner existente com autorizacao de escrita separada. Nunca usar o usuario antigo ou os produtos reais como atores/dados de teste, nem executar gateways/mensagens reais.

O default PENDING/PENDENTE nao foi alterado: o escritor atual pix-notification envia PENDING explicitamente, consistente com o antigo. Nao reaplicar uma migration historica para forcar o outro default; validar os consumidores vivos antes de qualquer ajuste desse contrato.

## Proximo passo exato

Concluir/disponibilizar as ferramentas Supabase ja adicionadas e executar as consultas de leitura JA autorizadas, somente no candidato. A consulta preparada esta em work/janela-preflight-leitura.sql desta conversa, sem credenciais. Solicitar autorizacao A apenas depois de identificar o job e os consumidores atuais. Nao solicitar agora permissao generica de migrations para contornar a falta dessa evidencia. Nenhuma nova tentativa de senha PostgreSQL sera feita nesta rodada.

## Atualizacao: acesso recuperado e baseline hospedado conferido

A tentativa manual posterior, expressamente autorizada pelo proprietario, concluiu a leitura em 18/11/2026 as 13:36:09Z, com TLS e READ ONLY. O bloqueio de leitura descrito acima esta superado. A conferencia atual e a proposta A estao em PREFLIGHT-HOSPEDADO-E-AUTORIZACAO-A.md; o manifesto JSON foi atualizado e o hash anterior nesta nota pertence a versao historica.

Permanecem proibidas todas as escritas. Primeira operacao pendente de autorizacao: somente active do job 1, com proposta e reversao separadas, sem migrations/usuarios/grants/fixture/Preview. Fonte local e dados antigos preservados; ausencia de consumidores externos e recuperacao integral nao foram comprovadas.

## Encerramento controlado — pausa nao autorizada

O proprietario decidiu manter o job 1 ativo e nao autorizou nenhuma escrita. As acoes A–F nao estao agendadas. Continuar diretamente por PREFLIGHT-HOSPEDADO-E-AUTORIZACAO-A.md, que contem estado, hashes, copias documentais dos comandos e a sequencia exata. Nao repetir auditorias, nao iniciar consultas/autenticacoes automaticamente e nao confundir scripts preparados com autorizacao. Backups, cinco alteracoes historicas do ERP e worktree do App preservados.
