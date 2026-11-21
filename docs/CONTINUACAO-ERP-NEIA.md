# CONTINUACAO ERP NÉIA — ERP + App Motoboy

Atualizado em 17/11/2026 (America/Sao_Paulo). Este relatório consolida a retomada sem refazer a auditoria.

## Estado confirmado dos repositórios

### ERP

- Pasta: C:\Users\User\ERP-NEIA-SALGADOS
- Branch: homologacao-finalizacao
- HEAD atual: 0567c576cfd5038e97816f6f96ee5f7f397b173a
- Índice: vazio.
- git diff --check e git diff --cached --check passaram.
- Alterações rastreadas preservadas e fora dos commits: AGENTS.md e os três PNGs anteriores:
  - docs/erp-dark/prints/central-entregas-DEPOIS-celular.png
  - docs/erp-dark/prints/central-entregas-DEPOIS.png
  - docs/reembolsos-estornos/capturas-origens/central-com-novas-solicitacoes.png
- Permanecem 276 itens não rastreados anteriores a este relatório (266 históricos + 10 arquivos C2/C3/homologação, conforme o estado já registrado). Este próprio relatório acrescenta mais um item não rastreado. Nada foi apagado ou incluído nos commits por varredura.

### App Motoboy

- Pasta: C:\Users\User\ERP-NEIA-BOY-WT
- Branch: feat/app-motoboy-integracao-m3-a
- HEAD: 556b21b6ab7273d9c116823615114dca8f0c26b5
- Índice vazio; git diff --check passou.
- Sem mudanças rastreadas. Permanecem 15 itens não rastreados (9 anteriores e 6 arquivos locais de integração/homologação). A worktree separada não foi modificada nesta execução.

## Commits locais criados nesta execução

Usado scripts/commit-seguro.ps1 com seleção explícita, HEAD/branch conferidos, diff revisado e confirmação COMMIT para cada commit:

1. 53e829c0e445cf6dbd1d91843bf8afe34ea466bd — fix(financeiro): endurece migration de pagamentos — somente drizzle/migrations/0106_financeiro_operacoes_atomicas.sql.
2. 0567c576cfd5038e97816f6f96ee5f7f397b173a — fix(estoque): desambigua RPC de movimento manual — somente drizzle/migrations/0107_movimento_estoque_manual_atomico.sql.

Nenhum push, deploy ou commit no App foi feito. Não houve conexão ao Supabase real nem execução de migration produtiva.

## Correções e validações já concluídas

### Financeiro 0106 e Estoque 0107

- 0106: corrigido o fallback textual do enum de pagamento nos três pontos que usavam COALESCE(..., 'outro'); proteção de baixa direta verifica que a escrita com marca transacional está sob o owner da RPC financeira confiável.
- 0107: chamada a registrar_mov_estoque agora resolve explicitamente a assinatura de nove parâmetros e seus tipos.
- Testes rápidos executados nesta execução: scripts/financeiro-operacoes-atomicas.test.mjs e scripts/estoque-operacao-atomica.test.mjs passaram. Eles validam contratos localmente, mas não comprovam concorrência/RLS por si sós.
- Homologação anterior reportada: PostgreSQL 17.11 descartável aplicou e testou 0106/0107, incluindo pagamentos parciais, repetição, estorno, negativa de baixa direta, estoque insuficiente e operações concorrentes/rollback. O cluster de testes foi parado. Esses resultados são da rodada anterior, não foram repetidos agora.

### Cadeia de migrations

- Para instalação limpa, foi testado manifesto de 99 migrations selecionadas até 0109.
- Para atualização sintética, ponte compatível com tabelas Pix antigas e 0077 foram aplicadas juntas; a sequência chegou a 0109.
- 0077 substitui a necessidade de executar os SQLs históricos defeituosos 0058/0061/0062/0063 em instalação nova; os históricos foram preservados. A migration 0001 precisou ser reordenada no manifesto de teste após dependências de 0050. A carga 0038 depende de UUIDs fixos e foi omitida da instalação de esquema, sem alterar catálogo real.
- 0099–0102 não foram tratados como defeito sem evidência.
- Arquivos do roteiro local: scripts/homologacao-pg17/ (README, executor PowerShell, manifesto, ponte de compatibilidade, fixtures e SQLs de regressão/impressão/rotas). São arquivos locais não rastreados, preservados.

### ERP e App Motoboy

- ERP: typecheck, build Nitro demonstrativo seguro, HTTP local /api/versao (200), suítes focadas de proteção, pedidos/produção, financeiro/estoque, frete, entregas, checkout e git diff --check passaram na rodada anterior. Nesta execução, não repetimos build/typecheck, pois não houve mudança de código fora de commits que apenas versionaram exatamente as migrations já testadas.
- App: nesta execução passaram 9 testes M3-B1 e 5 testes da consulta local das rotas ERP (isolamento loopback, chave pública, sessão e falhas). Na rodada anterior, M1/M2 somou 48 testes; typecheck e builds demonstrativo e local integrado passaram.
- PostgreSQL exercitou rotas atribuídas com dois motoboys sintéticos e restringiu a consulta ao próprio usuário via papéis simulados. Isso não equivale a RLS real via Supabase Auth/PostgREST.

## Integração atual e lacunas

- ERP possui migration local não versionada drizzle/migrations/0109_motoboy_rotas_atribuidas.sql e testes/roteiro em scripts/homologacao-pg17/. 0109 permite leitura autenticada das rotas atribuídas ao motoboy, mas é read-only.
- O App possui uma tela local separada que autentica com cliente Supabase usando URL e chave pública de teste fornecidas somente no processo e consulta as rotas atribuídas. Os seis arquivos novos de integração permanecem não rastreados e sem commit.
- A tela operacional antiga /motoboy ainda tenta autoatribuir/criar rota diretamente. Não aplicar 0109 em ambiente operacional antes de substituir ou desativar esse caminho por uma migração coordenada e validada. Não misturar isso com a tela aprovada da Central.
- Ainda faltam RPCs persistidas e autorizadas para confirmar retirada, iniciar deslocamento, entregar cada pedido, retornar à loja e registrar/acertar valores. O motoboy não deve autoaprovar compensação/fechamento; dinheiro, Pix, taxas e trocos precisam continuar separados.
- GPS contínuo e em segundo plano não foi implementado nem testado em aparelho. Android/iOS requerem configuração nativa e testes nos dispositivos. Impressora física também não foi testada.
- Não há evidência de projeto Supabase staging/Preview Vercel isolado e autorizado disponível para esta rodada. A autenticação/RLS real, fluxos E2E de cliente a financeiro, gateways Pix/cartão, WhatsApp e Preview externo permanecem não testados.

## Próxima tarefa exata

1. Em ambiente Supabase de staging isolado e autorizado, ligar contas sintéticas (incluindo dois motoboys) a motoboys.user_id e validar 0109 via Auth/PostgREST e políticas RLS. Até isso existir, manter 0109 sem rollout operacional.
2. Em seguida, implementar migration/RPC incremental para transições individuais da rota: retirada, início, entrega, retorno à loja. Cada RPC deve validar usuário e propriedade da rota, bloquear em ordem estável rota/pedido, validar status atual, registrar evento idempotente e atualizar o estado usado pela Central. Não gravar nem aprovar dinheiro por essas ações.
3. Substituir o fluxo legado de autoatribuição por essas RPCs e conectar a tela local do App às transições. Cobrir repetição, concorrência, falha/rollback e pedido alheio em PostgreSQL e depois repetir via staging real.
4. Separadamente, desenhar o acerto financeiro com conferência por Caixa e aprovação por responsável distinto, mantendo Pix à loja, dinheiro de produtos por rota, taxa no fechamento de turno e troco auditado.

Para retomar sem reconstrução, começar lendo este arquivo, AGENTS.md nos dois repositórios, confirmar os HEADs atuais e revisar os diffs/arquivos novos. Não repetir os testes Postgres anteriores sem mudança que justifique.

## Limites de publicação

Nenhuma produção foi modificada. Não há cutover, migration produtiva, chave real fornecida, push, deploy ou versão Android/iOS assinada. Antes de qualquer operação de produção ainda são necessários staging isolado com contas fictícias, E2E representativo, backup restaurável, plano de rollback e autorização específica do proprietário.



## Revisão adicional — segurança Central → App Motoboy (17/11/2026)

### Estado conferido

- ERP segue em homologacao-finalizacao, HEAD 0567c576cfd5038e97816f6f96ee5f7f397b173a, índice vazio, 277 itens não rastreados. Permanecem somente as quatro alterações rastreadas preexistentes: AGENTS.md e os três PNGs.
- App segue em feat/app-motoboy-integracao-m3-a, HEAD 556b21b6ab7273d9c116823615114dca8f0c26b5, índice vazio, 15 itens não rastreados e nenhuma alteração rastreada.
- PostgreSQL descartável da execução foi encerrado; porta 55437 não responde. Nenhum Supabase foi acessado.

### Achado e correção pequena

A migration 0000 permitia a qualquer motoboy ler pedidos sem atribuição nos estados pronto/aguardando_motoboy. A migration 0070 também conservava uma policy de UPDATE que permitia reivindicar esses pedidos. Assim, um motoboy podia obter endereço/dados de entrega e contornar a atribuição da Central.

A migration incremental 0109 agora:
- substitui a policy de SELECT para motoboys lerem somente pedidos cujo motoboy_id corresponde ao usuário autenticado;
- remove a policy pedidos motoboy claim, encerrando a reivindicação direta;
- preserva acesso de cliente, administrador, produção e policies operacionais adicionais;
- mantém a leitura da rota atribuída via RPC motoboy_listar_rotas_atribuidas, que deriva o usuário por auth.uid() e é SECURITY INVOKER.

O teste scripts/homologacao-pg17/rotas-app.sql agora cria um pedido pronto sem atribuição e verifica que o motoboy não consegue lê-lo nem reivindicá-lo, enquanto continua lendo seu pedido atribuído. Também verifica que o segundo motoboy não vê a rota alheia e que cliente não pode chamar a RPC.

### Evidência de teste desta revisão

- PostgreSQL 17 descartável: instalação limpa das migrations do manifesto até 0109 passou, junto com regressoes.sql, rotas-app.sql e impressao.sql. O teste novo de acesso a pedido não atribuído passou.
- App: node --import tsx --test scripts/motoboy-rotas-erp.test.mjs passou, 4/4.
- git diff --check passou nos dois repositórios. O teste de políticas no PostgreSQL usou roles/JWT sintéticos; não comprova Supabase Auth/PostgREST ou RLS em staging real.
- Nenhum build foi repetido porque a alteração foi somente SQL e fixture de teste local.

### Arquivos desta revisão

- Modificado nesta etapa, ainda não versionado: drizzle/migrations/0109_motoboy_rotas_atribuidas.sql
- Modificado nesta etapa, ainda não versionado: scripts/homologacao-pg17/rotas-app.sql
- Este relatório atualizado: docs/CONTINUACAO-ERP-NEIA.md
- Nenhum arquivo do App foi alterado nesta etapa.

### Revisão do App e pendência de segurança antes do rollout

A tela local usa signInWithPassword e sessão do cliente Supabase; a consulta chama somente motoboy_listar_rotas_atribuidas, sem enviar identidade de motoboy. A configuração Vite desativa o carregamento automático de .env, aceita URL somente em loopback e chave pública, rejeitando sb_secret/service_role. Os testes confirmam essas proteções. Não foram fornecidas credenciais e não houve conexão de rede ao Supabase.

A tabela pedidos ainda permite ao dono autenticado alterações diretas de status em linhas já atribuídas conforme o fluxo legado de 0070. Isso não expõe rotas de outro usuário, mas significa que transições de entrega ainda não estão centralizadas em RPC idempotente. Antes de habilitar o novo App/0109 operacionalmente, substituir essas transições por RPCs de retirada, início, entrega e retorno; validar que a policy/trigger bloqueia mutações diretas depois da troca, sem quebrar o fluxo antigo antes dela.

### Próxima sequência para OpenCode

1. Revisar o diff e validar a 0109 atualizada em um projeto Supabase de staging isolado, com Auth/PostgREST e dois entregadores sintéticos. Confirmar SELECT permitido apenas para o motoboy dono, pedidos sem atribuição invisíveis e UPDATE/claim direto negado.
2. Modelar eventos idempotentes de rota/pedido e criar RPCs incrementais para retirada, início de rota, entrega individual e retorno à loja. Cada RPC valida auth.uid()↔motoboys.user_id↔rotas_entrega.motoboy_id, propriedade e status; bloqueia linha(s) em ordem consistente; grava evento e estado na mesma transação.
3. Adicionar testes PostgreSQL para repetição, duas chamadas concorrentes, pedido alheio, transição inválida e rollback forçado; depois repetir os mesmos casos via API autenticada no staging.
4. Conectar o App local a essas RPCs e atualizar a Central a partir do estado persistido. Retirar permissões de UPDATE direto só na mesma implantação coordenada, depois do caminho RPC estar ativo.
5. Implementar retorno e abertura de acerto separado das decisões financeiras: Caixa confere, responsável diferente aprova; motoboy nunca aprova o próprio fechamento. Preservar Pix da loja, dinheiro de produtos por rota, taxas no fechamento de turno e troco auditável.
6. Testar o fluxo completo e manter GPS em segundo plano, impressão física, gateways e mensagens fora do status de concluído até validação em dispositivos/serviços reais autorizados.



## Consolidação final antes do limite — 17/11/2026

### Commit e estado atual

- Commit local novo: 9d621cf8e9600e047f0db4f8ba883c23b969018a — fix(motoboy): bloqueia autoatribuicao de pedidos.
- Conteúdo exato do commit:
  1. drizzle/migrations/0109_motoboy_rotas_atribuidas.sql
  2. scripts/homologacao-pg17/rotas-app.sql
- O índice foi vazio antes de preparar. Os dois caminhos foram adicionados explicitamente, o conteúdo inteiro de diff --cached foi revisado, diff --cached --check passou e nenhum terceiro arquivo entrou. O script commit-seguro.ps1 ainda não tem opção específica para 0109; não foi alterado. A seleção explícita e o diff foram conferidos manualmente conforme autorização desta etapa.
- ERP: branch homologacao-finalizacao, HEAD 9d621cf8e9600e047f0db4f8ba883c23b969018a, índice vazio, diff-check limpo. Permanecem somente AGENTS.md e os três PNGs como alterações rastreadas. Permanecem 275 itens não rastreados, incluindo arquivos históricos e este relatório.
- App: branch feat/app-motoboy-integracao-m3-a, HEAD 556b21b6ab7273d9c116823615114dca8f0c26b5, índice vazio, diff-check limpo, sem alterações rastreadas e com 15 itens não rastreados. Nenhum arquivo do App foi alterado.
- Sem push, deploy, acesso a Supabase ou migration produtiva.

### Testes que autorizam o commit

- Antes do commit, a instalação limpa em PostgreSQL 17 descartável aplicou a cadeia selecionada até 0109 e passou regressoes.sql, rotas-app.sql e impressao.sql. O caso novo provou que o motoboy não vê nem reivindica pedido sem atribuição; sua rota atribuída continuou visível e a rota do outro motoboy permaneceu negada. O cluster foi parado e a porta 55437 não respondia.
- O teste específico do App node --import tsx --test scripts/motoboy-rotas-erp.test.mjs passou, 4/4.
- O PostgreSQL usou papéis e claims sintéticos. Auth, PostgREST e RLS reais ainda precisam ser validados em staging.

### Próxima tarefa exata para OpenCode MiniMax Thinking

1. Abrir este relatório e AGENTS.md nos dois repositórios; confirmar os HEADs acima e não reexecutar a homologação limpa, pois o commit contém exatamente os arquivos já homologados.
2. Revisar o commit 9d621cf e preparar validação da 0109 em Supabase staging isolado com Auth/PostgREST: dois motoboys, atendente/expedição e cliente fictícios. Testar rota própria permitida, rota alheia negada, pedido não atribuído invisível e reivindicação/UPDATE direto negados. Não aplicar em produção.
3. No ERP, inspecionar contratos/tabelas atuais em migrations 0044, 0047, 0084, 0108 e 0109. Projetar uma migration incremental para eventos idempotentes e RPCs separadas: confirmar retirada da rota, iniciar deslocamento, confirmar entrega individual, informar retorno e confirmar chegada à loja. Cada RPC deve obter o ator por auth.uid(), validar motoboys.user_id e rotas_entrega.motoboy_id, validar associação/status, bloquear pedido/rota numa ordem estável, registrar evento e atualizar status na mesma transação. Respostas repetidas devem ser idempotentes; pedido alheio ou transição inválida não muda dados.
4. Testar a migration/RPC em PostgreSQL descartável com sucesso, repetição, duas chamadas concorrentes, falha forçada/rollback, pedido alheio e RLS. Repetir via Auth/PostgREST de staging quando houver credenciais isoladas.
5. No App, alterar somente src/motoboy-local/rotas-erp.ts e src/motoboy-local/app-motoboy-local.tsx para chamar RPCs e apresentar estados/erros; adicionar testes em scripts/motoboy-rotas-erp.test.mjs. Não enviar atualização otimista que marque sucesso sem resposta do servidor. Atualizar a Central pela persistência compartilhada, sem inventar estado local.
6. Coordenar a retirada das mutações diretas antigas de pedidos somente junto com RPCs funcionais. Testar também /motoboy legado para evitar quebra operacional antes da troca.
7. Em lote separado, implementar acerto: motoboy informa valores, Caixa confere, responsável diferente aprova; impedir autoaprovação. Preservar Pix da loja, devolução do dinheiro dos produtos por rota, taxa de entrega paga no fechamento do turno e troco próprio separado/auditado. Criar ledger/idempotência e validar em PostgreSQL antes do staging.
8. Não iniciar GPS em segundo plano ou produção até haver implantação nativa e testes reais nos dispositivos; não declarar E2E completo sem percorrer cliente → atendimento → estoque → produção → Central → App → acerto → financeiro.


## Revisão adicional de segurança do fechamento — 17/11/2026

### Correções locais preparadas

- Nova `drizzle/migrations/0118_bloquear_dml_financeiro_motoboy.sql`: revoga INSERT direto de `authenticated` em acertos, eventos de acerto, turnos e eventos de turno; remove as políticas de inserção direta correspondentes. Preserva as escritas feitas pelas RPCs `SECURITY DEFINER` e o acesso `service_role`.
- A mesma migration revoga EXECUTE de `pagar_fechamento_turno` para `PUBLIC`, `anon` e `authenticated`. A RPC anterior deixava o próprio motoboy registrar como pago um valor que a loja lhe deve. Pagamento por Financeiro ainda não existe; por segurança, a operação permanece indisponível até implementação de um fluxo de confirmação autorizado.
- A migration adiciona uma constraint `NOT VALID` para garantir que `vespera_natal` corresponda a 24/12 e vice-versa. Dados históricos não são validados nem removidos; novas gravações/atualizações passam pela regra.
- `scripts/homologacao-pg17/fechamento-turno.sql` agora usa data determinística e verifica rejeição de data incompatível, negação do pagamento feito pelo motoboy e ausência de conta/turno falsamente pagos.
- `scripts/homologacao-pg17/seguranca-financeira-motoboy.sql` verifica privilégios e tentativas de escrita direta; `executar.ps1` inclui esse teste e o teste de fechamento; `instalacao-limpa.txt` inclui a migration 0118.

### Evidência e limites

- PostgreSQL 17 descartável havia aplicado a cadeia até a versão anterior da 0118 e passado as regressões, rotas e impressão. A reexecução necessária após incluir o novo teste de fechamento não completou: o ambiente encerrou os processos de PostgreSQL/psql antes de produzir resultado SQL. Portanto, a constraint, o fechamento revisado e o teste de privilégios da versão atual da 0118 são **NÃO TESTADOS** em PostgreSQL nesta rodada. Não declarar atomicidade, RLS real, grants efetivos via PostgREST ou rollback comprovados por essa tentativa.
- Testes do App Motoboy `motoboy-rotas-erp.test.mjs` e `motoboy-operacoes-persistidas.test.mjs`: **18/18 passaram**. São testes locais de contrato, sem Auth/PostgREST reais.
- Git no ambiente atual continua respondendo `fatal: this operation must be run in a work tree` para status/diff. Não foi possível confirmar índice, diff-check ou lista completa de mudanças via Git nesta rodada. Os HEADs lidos foram ERP `9d621cf8e9600e047f0db4f8ba883c23b969018a` e App `556b21b6ab7273d9c116823615114dca8f0c26b5`; nenhum commit foi criado.
- Typecheck/build não foram repetidos: nenhum TypeScript foi alterado nesta rodada; resultados anteriores permanecem referências históricas, não validação da migration atual.
- Dois diretórios temporários incompletos de homologação foram criados em `C:\Users\User\Documents\Codex\neia-pg17-e77ac4f171574c8a9359c5fd830d084d` e `C:\Users\User\Documents\Codex\neia-pg17-6ebe1f965d7a4cb59bbe5e27d68be2ca`. A tentativa de removê-los foi bloqueada pela revisão automática porque ela não conseguiu confirmar com segurança a propriedade dos diretórios. Os clusters não responderam nas portas usadas; a configuração `pg_hba.conf` do cluster anterior foi restaurada. Solicitar autorização para remover somente esses dois diretórios temporários, se desejado.

### Pendências críticas que impedem rollout

- Revisar `0112_iniciar_rota.sql`: a RPC inicia rota e altera pedidos sem exigir prova de aceite/retirada de cada pedido. Corrigir incrementalmente e testar transição e rollback antes de habilitar operação real.
- O acerto de rota ainda aceita valores declarados pelo entregador sem recomputação financeira independente. Caixa precisa registrar a contagem efetiva e o servidor deve validar recebimentos/taxas antes de permitir aprovação.
- O pagamento do turno foi desabilitado até existir RPC/painel Financeiro que registra comprovante e ator autorizado; atualizar a UI do App para não oferecer ação que será negada.
- A nova 0118 e as correções relacionadas não estão versionadas. Antes de commit: validar a instalação limpa e `fechamento-turno.sql` em PostgreSQL 17 isolado; executar `git status`, revisar staged/unstaged separadamente e `git diff --check` no PowerShell do Windows. Não usar `git add` geral.
- Homologar Auth/RLS/roles via Supabase staging isolado continua pendente; não usar o projeto de produção nem seu `.env` como staging.

### Próxima tarefa exata

No OpenCode: ler este relatório e revisar somente `0112_iniciar_rota.sql`, `0115_acerto_rota.sql`, `0116_acerto_conferir_aprovar.sql`, `0117_fechamento_turno.sql` e a UI de fechamento do App. Primeiro corrigir a pré-condição de retirada e separar a solicitação do motoboy da confirmação de pagamento pelo Financeiro; recalcular o acerto no servidor a partir dos pedidos/ledger e de uma contagem independente do Caixa. Criar testes sintéticos de sucesso, repetição, concorrência, transição inválida e rollback. Só então homologar a migration 0118 revisada em cluster PostgreSQL isolado e preparar commits seletivos sem incluir arquivos históricos.

### Atualização — correção local da 0112

Foi alterada `drizzle/migrations/0112_iniciar_rota.sql` para bloquear rota vazia e exigir, para cada pedido associado, entrega, atribuição ao usuário autenticado, `retirada_em` e `retirada_por` do mesmo motoboy. Os pedidos são bloqueados em ordem de ID; o UPDATE exige que a quantidade de pedidos transicionados seja igual ao total, lançando exceção para rollback em divergência. **Ainda não homologada em PostgreSQL**, pois o ambiente local descartável não permaneceu acessível ao processo de teste desta execução. Não versionar antes de testar 1, 2 e 3 pedidos, retirada parcial e concorrência.

### Execução de homologação posterior — 17/11/2026

- PostgreSQL 17.11 foi iniciado em novo cluster descartável (porta 55443, loopback); cadeia selecionada aplicou até 0118 sem erro, e `regressoes.sql`, `rotas-app.sql` e `impressao.sql` passaram. O runner parou o cluster ao falhar, e a porta não respondeu depois.
- A execução parou em `fechamento-turno.sql`, caso 1: `ERROR: Caso1 falhou: devido=4000`; teste esperava 4785 (R$40 + R$7,85 de taxas aprovadas). Isso indica que a fixture de acerto não foi encontrada como aprovada/data do turno pela consulta da RPC. Corrigir a fixture ou o critério verificando os registros sintéticos no próximo run; não marcar 0118 aprovada enquanto a regressão do fechamento falhar.
- Por causa dessa falha, `seguranca-financeira-motoboy.sql` não foi alcançado nesta rodada. A nova restrição de 24/12 chegou a ser instalada, mas os casos de data e permissões não foram executados após o erro.
- `0112` foi aplicada pela cadeia, mas o runner não executa `iniciar-rota.sql`; portanto os casos específicos de retirada obrigatória, 1–3 pedidos, idempotência, concorrência e rollback seguem **NÃO TESTADOS**.
- `git -C` com execução autorizada funcionou: ERP em `homologacao-finalizacao`, HEAD `9d621cf8e9600e047f0db4f8ba883c23b969018a`; índice vazio. Mantêm-se AGENTS.md, três PNGs e `.temp` modificados, além dos arquivos não rastreados. Não houve commit, push ou deploy. App não foi alterado.
- Os diretórios temporários antigos continuam preservados e parados, conforme instrução; não foram removidos.

### Reteste corrigido de 0118 — 17/11/2026

- Causa exata dos R$ 785 ausentes: a fixture de `fechamento-turno.sql` chamava `iniciar_rota` antes da retirada, ignorava a resposta `bloqueado` da 0112 e atualizava pedidos diretamente. A rota, portanto, permanecia `preparando`; `solicitar_acerto_rota` não criava o acerto elegível, e `solicitar_fechamento_turno` corretamente somava R$ 0 de taxas, retornando apenas R$ 40 (4000 centavos). Não era conversão centavos/reais nem erro do filtro temporal da 0117.
- Corrigida a fixture para chamar `confirmar_retirada` para cada pedido, exigir resultado `ok` do início da rota, solicitação, conferência e aprovação, e confirmar que o acerto está `aprovado` com R$ 7,85 antes de solicitar o turno.
- Nova cadeia limpa PostgreSQL 17.11, porta 55444/loopback: **PASSOU** aplicação selecionada até 0118, `regressoes.sql`, `rotas-app.sql`, `impressao.sql`, `fechamento-turno.sql` e `seguranca-financeira-motoboy.sql`. Evidência local em `C:\Users\User\Documents\Codex\neia-pg17-5ad73a5a14d143a49fa3aeb5cac9f6df\sql.log`. O runner encerrou o cluster; porta 55444 sem resposta depois.
- O teste de fechamento cobre R$40, R$40+R$7,85 aprovados, repetição idempotente, R$60 em 24/12, rejeição de véspera em 23/12, pagamento do motoboy negado e ausência de marcação falsa de pago. O teste de permissões 0118 também passou para os INSERTs diretos e EXECUTE revogado.
- Limitação: os cenários ampliados solicitados (taxas não aprovadas, outro motoboy/turno, múltiplas rotas, concorrência e rollback do fechamento) ainda não têm testes comprovados nesta execução. A 0112 foi aplicada pela cadeia, mas seu arquivo dedicado `iniciar-rota.sql` ainda não integra o runner e seus novos casos de retirada para rotas de 1–3 pedidos não foram executados. Não declarar essas propriedades homologadas.
- Nenhum commit criado. Manter alterações locais até os cenários pendentes serem adicionados/testados e a revisão Git seletiva concluir.


## Fase E — Integração App Motoboy (concluída, somente local/isolado)

- Migrations criadas e testadas em PostgreSQL 17 descartável (cadeia 0000–0109 + regressões + rotas-app), sem Supabase real, sem .env, sem push/commit:
  - drizzle/migrations/0110_confirmar_retirada.sql (aprovada, 9 casos)
  - drizzle/migrations/0111_aceitar_rota.sql (aprovada, 7 casos)
  - drizzle/migrations/0112_iniciar_rota.sql (aprovada, 7 casos)
  - drizzle/migrations/0113_confirmar_entrega.sql (aprovada, 9 casos; prova que um pedido entregue não conclui os demais da rota)
  - drizzle/migrations/0114_retorno_chegada_loja.sql (aprovada, 10 casos)
  - scripts/homologacao-pg17/{retirada,aceitar-rota,iniciar-rota,confirmar-entrega,retorno-chegada}.sql (testes isolados)
- App Motoboy conectado às RPCs (sem UPDATE direto que contorne as RPCs):
  - src/motoboy-local/rotas-erp.ts — contratos Zod para cada operação, chamarOperacao com tratamento de rede/sessão expirada/estado inválido/operação repetida, trava de execução, não confirma sucesso sem resposta do servidor.
  - src/motoboy-local/app-motoboy-local.tsx — tela com botões por rota/pedido (aceitar, retirar, iniciar, entregar, informar retorno, confirmar chegada), trava de cliques repetidos por operação, feedback apenas após resposta do servidor, reconsulta do estado persistido após cada sucesso.
  - src/isolated-motoboy/app.css — classes novas de botoes-cabecalho, feedback, pedido-da-rota, pedido-status, acoes-rota/pedido (layout grafite/dourado preservado).
- Testes do App:
  - scripts/motoboy-rotas-erp.test.mjs: 4/4 (existentes, preservados).
  - scripts/motoboy-operacoes-persistidas.test.mjs: 14/14 (novos: sucesso, rejeição, sessão expirada, rede, resposta inválida, contrato Zod, chamada correta de cada RPC).
- Typecheck ERP e App: passaram. Build ERP (Nitro) e build isolado App Motoboy (Vite): passaram.
- Testes ERP central-pedidos.test.mjs: passaram.

## Fase F — Acerto financeiro por rota e fechamento de turno (concluída, somente local/isolado)

Migrations criadas e testadas em PostgreSQL 17 descartável (cadeia 0000–0117), sem Supabase real, sem .env, sem push/commit:
- drizzle/migrations/0115_acerto_rota.sql — solicitar_acerto_rota (motoboy solicita; idempotente por chave) (aprovada, 7 casos)
- drizzle/migrations/0116_acerto_conferir_aprovar.sql — conferir_acerto_rota (caixa/financeiro) + aprovar_acerto_rota (responsável diferente do conferente; auto-aprovação bloqueada) (aprovada, 7 casos)
- drizzle/migrations/0117_fechamento_turno.sql — solicitar_fechamento_turno (valor fixo R$ 40 normal / R$ 60 véspera de Natal + taxas acumuladas) + pagar_fechamento_turno (ledger via contas 0072/0106; idempotente) (aprovada, 11 casos)
- scripts/homologacao-pg17/{acerto-solicitar,acerto-conferir-aprovar,fechamento-turno}.sql (testes isolados)

Regras de segurança implementadas no servidor:
- Somente o motoboy da rota solicita seu acerto.
- Somente admin/financeiro confere; aprovador deve ser diferente do conferente (separação de funções).
- Motoboy nunca aprova o próprio acerto.
- Idempotência por chave_idempotencia + advisory locks; rollback automático na transação.
- Nenhum UPDATE direto que contorne aprovações.

App Motoboy — Fase F integrada (UI + contratos):
- src/motoboy-local/rotas-erp.ts — contratos Zod + wrapper functions: solicitarAcertoRota, conferirAcertoRota, aprovarAcertoRota, solicitarFechamentoTurno, pagarFechamentoTurno; rota status agora inclui "concluida".
- src/motoboy-local/app-motoboy-local.tsx — UI acerto/turno: botão "Solicitar acerto" (rota concluída), modal valor acerto, modal fechar turno (normal/véspera Natal), modal pagamento turno; trava de cliques repetidos; feedback apenas após resposta do servidor; reconsulta estado persistido.
- src/isolated-motoboy/app.css — classes de feedback/modal já existentes reutilizadas; layout grafite/dourado preservado.
- Typecheck, build Vite, e testes App (4/4 existentes + 14/14 operações + 9/9 M3-B1) passaram.

Pendentes de segurança (registro, não alterados para não interromper o sistema existente):
- src/routes/motoboy.tsx (ERP, legado) mantém 9 escritas diretas (UPDATE pedidos/motoboys; INSERT rotas_entrega/rota_pedidos) que contornam as novas RPCs (linhas 206, 216, 225, 247, 256, 478, 481, 483, 591). Devem ser analisadas, testadas e substituídas/restringidas no cutover coordenado com as RPCs funcionais, nunca antes.
- Autenticação/RLS real via Supabase Auth/PostgREST ainda NÃO homologada em staging. Não há staging isolado autorizado; o .env aponta para o projeto principal.

## Consolidação das fases E/F — 17/11/2026

- **Entregas 0110–0114.** Cada retirada fica ligada ao pedido, à rota e ao motoboy autenticado. O início rejeita rota vazia, retirada ausente ou parcial e prova de outra rota ou pessoa. A atribuição continua na Central. Aceite, retirada, início, entrega e retorno respeitam a ordem de bloqueio dos registros. O teste de rollback injeta uma falha durante a atualização dos pedidos e confere que a rota permanece em preparação.
- **Acerto 0115–0119.** Uma rota só pode ter um acerto em andamento ou aprovado. O servidor lê os pedidos entregues e seus recebimentos líquidos no ledger, separa Pix da loja, produtos pagos em dinheiro e taxas, e guarda o esperado, a declaração, a referência do troco e a contagem física do Caixa. Sem recebimento confiável ou com divergência, não há aprovação. O responsável precisa ser distinto do motoboy e do conferente. Rejeitar permite nova solicitação. O troco próprio que exige reembolso continua bloqueado até existir comprovante e lançamento autorizado no fluxo de reembolsos.
- **Pagamento de turno 0120.** O responsável autoriza o total após conferir as rotas concluídas na data local de São Paulo. O Financeiro registra um pagamento já efetuado, com Pix ou dinheiro, data efetiva e referência obrigatória para Pix. O servidor revalida o acerto, recusa duplicação e grava uma única conta, o evento do ledger e a auditoria na mesma transação. O valor fixo permanece R$ 40 ou R$ 60 em 24/12. O registro confirma a declaração do Financeiro com referência, sem executar transferência nem consultar um provedor bancário.
- **App e ERP 0121.** O App mostra rotas concluídas que ainda precisam de acerto, sem incluir os dados dos clientes na resposta dessas rotas. O motoboy pode solicitar o turno e recebe sucesso apenas com protocolo válido. No ERP, a seção de acertos do Financeiro exibe valores conferidos e permite as ações compatíveis com cada perfil.

### Evidência e versionamento

- PostgreSQL 17.11 em 127.0.0.1, porta 55452. A cadeia selecionada aplicou até 0121. Passaram `regressoes.sql`, `rotas-app.sql`, `inicio-rota-integridade.sql`, `inicio-rota-concorrencia.sql`, `impressao.sql`, `fechamento-turno.sql`, `seguranca-financeira-motoboy.sql`, `pagamento-turno.sql` e `financeiro-motoboy-concorrencia.sql`. Duas sessões disputaram retirada e início, dois inícios, duas aprovações e duas confirmações de pagamento. O teste verificou o lock antes de liberar a primeira sessão, um único evento por operação, a data efetiva do ledger e rollback integral quando o evento de pagamento falha. O cluster está parado. Log local em `C:\Users\User\Documents\Codex\neia-pg17-1909107ee4f948939c92d4e11d1e283b\sql.log`.
- ERP 35/35 testes no runner Node de financeiro, estoque, competência, reservas, Central e atribuição de rotas. App 20/20 entradas no runner Node, incluindo a suíte M3-B1 com 9 casos internos. Passaram typecheck e builds locais Vite/Nitro do ERP e Vite do App. Passaram `git diff --check` e `git diff --cached --check` nas duas worktrees. Os testes SQL usaram papéis e claims sintéticos de PostgreSQL. Falta o E2E com Auth/PostgREST reais.
- ERP, branch `homologacao-finalizacao`: `56cbf2c9bd34a6ae1fa035607676d05e431e2f2f` (0110–0114 e testes de início), `13fb26e037a01aa2582ee91192c3db4dde3ad2e4` (0115–0121, testes financeiros e painel do ERP), `8c834af528e84f1164f197165b9cf3b44a92698a` (executor, manifesto e fixtures de homologação).
- App, branch `feat/app-motoboy-integracao-m3-a`: `59e2269474cfa75ca602be160118dbacaf31a824` (App local, configuração, CSS e dois testes de contrato).
- Ambos os índices vazios. ERP mantém AGENTS.md, três PNGs e supabase/.temp/cli-latest como modificações rastreadas e 277 arquivos não rastreados, incluindo este relatório. App mantém 9 arquivos não rastreados anteriores, incluindo o serviço e o teste M3-B1. Os diretórios temporários antigos foram preservados. Não houve push, deploy, transferência nem acesso ao Supabase.

Para repetir o PostgreSQL local no PowerShell, invocar `& 'C:\Users\User\ERP-NEIA-SALGADOS\scripts\homologacao-pg17\executar.ps1' -Scratch 'C:\Users\User\Documents\Codex' -Port 55452` com PostgreSQL 17 nativo e a porta disponível.

### Retomar homologação integrada

1. Obter a autorização e a referência exata de um projeto Supabase destinado somente a staging, com credenciais próprias e sem dados reais. Conferir identidade e permissões antes de aplicar qualquer migration. O App atual aceita apenas loopback. Para estágio remoto, preparar configuração exclusiva que aceite somente o projeto de staging confirmado. A chave pública entra no App; credenciais administrativas ficam fora do bundle.
2. Antes de aplicar a 0119, conferir se há rotas com mais de um acerto não rejeitado e separar qualquer histórico sem conferência independente para revisão. O índice único recusa o cenário de duplicidade. Preservar os dados e homologar a instalação completa até 0121 antes de liberar os novos fluxos.
3. Criar contas fictícias de cliente, Central, dois motoboys, Caixa, responsável e Financeiro. Conferir sessão real via Auth, visibilidade por RLS e resposta PostgREST para leitura de rotas próprias e alheias, retirada parcial, acerto divergente, conferência, aprovação por outra pessoa, confirmação de pagamento, repetição e tentativa direta por perfil não autorizado.
4. Coordenar o corte de `src/routes/motoboy.tsx`. Trocar reivindicação e criação direta de rota pela atribuição da Central, saída e entrega pelas RPCs 0110–0114, e repassar atraso, avisos e cadastro de motoboy aos responsáveis por esses fluxos. Testar cada caminho em staging antes de fechar as permissões antigas de escrita.
5. Rodar o E2E do checkout ao fechamento em Preview exclusivo, incluindo dinheiro, Pix simulado, retirada, entrega, agendamento, falha de rede, cancelamento e rollback. Validar GPS em aparelhos Android/iOS e impressão física separadamente. Prévia, produção, pagamentos reais e WhatsApp dependem dos ambientes e acessos próprios.
6. Publicação após homologação e aprovação específica. Fazer backup verificável e ensaiar restauração em staging. Para rollback do aplicativo, manter a versão anterior e interromper novas operações antes de reverter o tráfego, preservando contas, histórico e ledger. Mudança de banco deve ter estratégia incremental aprovada a partir do estado do backup.

## Preparação de Auth/RLS real e corte — 17/11/2026

- Consulta somente de inventário pela CLI encontrou dois projetos. O projeto nomeado `neia-salgados-staging` tem a referência `ruioyioynwwwiqbjznoa`, explicitamente bloqueada como produção em `scripts/proteger-dev.mjs`. O nome não comprova isolamento. Nenhum SQL, chamada Auth, chave ou dado desse banco foi acessado. O outro projeto listado não possui designação de staging confirmada. Foi solicitada ao proprietário uma referência separada autorizada ou autorização para criar projeto Free conforme disponibilidade da cota.
- Acrescentados runner API `scripts/homologar-auth-staging.mjs`, fixture de banco `scripts/homologacao-staging-fixture.sql`, testes locais de isolamento e configuração `vite.staging.config.ts`. O runner exige oito usuários Auth reais, referência aprovada, chave pública, protocolo e marcador sintético antes de acessar tabelas. A fixture foi validada em PostgreSQL local com usuários simulados para conferir o SQL, sem prova de Auth real.
- Migration local `0122_corte_motoboy_rpc_gps.sql` prepara interruptor inicialmente desligado e bloqueio de escrita direta. Modo novo no ERP usa `PainelMotoboyRpc` quando o build inclui `VITE_NEIA_MOTOBOY_RPC=1`. O legado fica disponível enquanto o build antigo/interruptor estiverem ativos. Alterações diretas antigas de estado, reivindicação, cadastro/disponibilidade, avisos e criação/vínculo de rotas ficam fora do caminho novo. A Central encerra via RPC que valida pedidos concluídos. É necessária homologação de cutover para ativar no ambiente operacional.
- GPS de primeiro plano preparado no App e no painel ERP, com permissão voluntária, rota própria em andamento, amostra limitada em idade/frequência/precisão, consulta apenas por dono/equipe, encerramento da visibilidade após entrega e remoção da posição ao concluir rota. Sem histórico persistente de coordenadas. Segundo plano Android/iOS exige solução nativa e aparelhos. O Android presente é o leitor Pix, separado do App Motoboy.
- A configuração de Preview usa variáveis próprias, ignora .env automático, bloqueia referências produtivas e chave administrativa e valida no servidor que o runtime corresponde ao destino/chave pública do build. Builds candidatos locais usam apenas referência e chave fictícias. URL Preview externa continua pendente da definição segura do backend.
- Roteiro completo e ações externas específicas estão em `docs/HOMOLOGACAO-REAL-ERP-MOTOBOY.md`, incluindo custos oficiais consultados, fixture, sequência de API, configuração Preview, dispositivos, backup e rollback.
- Uma regressão estática antiga falhou porque exigia o rótulo `Chamar motoboy` em Produção, que já foi substituído pela liberação separada de entrega/retirada. O teste foi corrigido para conferir os caminhos aprovados, sem alteração da tela Produção.
- HEADs de início desta execução ERP `8c834af528e84f1164f197165b9cf3b44a92698a`, App `59e2269474cfa75ca602be160118dbacaf31a824`. Nenhum novo commit nesta execução até a revisão final. Preservados AGENTS.md, três PNGs, .temp e diretórios antigos.
- Resultados finais desta rodada local. PostgreSQL 17 até 0122 e regressões do corte/GPS passaram na porta 55458, log `C:\Users\User\Documents\Codex\neia-pg17-945c657cbdfc4c5fa54a81d2ed276335\sql.log`. Fixture de staging passou no cluster sintético da porta 55457, log `C:\Users\User\Documents\Codex\neia-pg17-7a480a49888a454bb9ae85a0789f915e\sql.log`. Passaram typechecks dos dois projetos, build Vite/Nitro de ERP com configuração própria de staging e Vite do App com destino fictício, 22 entradas locais de teste do App e 4 testes unitários de isolamento de staging mais 2 de seleção de UI/GPS. O pacote ERP contém a proteção SSR de destino e nenhuma URL produtiva conhecida no código gerado. As mesmas proteções precisam ser provadas no runtime remoto após disponibilizar staging.
- A configuração 0122 e o novo painel foram preparados para corte explícito, com o modo operacional corrente preservado. A sessão ainda precisa de aprovação visual e E2E no novo painel e do backend Auth real. Por isso os arquivos desta rodada permanecem locais sem commit.

## Consolidação e proteção dos dados existentes — 17/11/2026

Este registro substitui a situação anterior de arquivos sem commit. O proprietário confirmou que o Supabase existente contém pedidos ou cadastros reais. A referência protegida, mesmo nomeada neia-salgados-staging, NÃO é staging. Nenhuma migration, escrita, teste Auth/API, backup remoto ou alteração de permissões foi executada nela nesta consolidação. As proteções de produção foram preservadas.

### Commits locais concluídos

ERP / homologacao-finalizacao:
- 5a9b1a95ed771e5e08ef7688b525019c1b9743cc — feat(entregas): prepara corte por RPC e GPS autorizado. 11 arquivos: drizzle/migrations/0122_corte_motoboy_rpc_gps.sql; scripts/e9_1-bloqueios-p0.test.mjs; scripts/homologacao-pg17/motoboy-corte-gps.sql; scripts/motoboy-corte-ui.test.mjs; src/components/admin/coleta-localizacao-rota.tsx; src/components/admin/painel-motoboy-rpc.tsx; src/env.d.ts; src/lib/localizacao-entrega.ts; src/routes/central-entregas.tsx; src/routes/motoboy.tsx; src/routes/pedido.$id.tsx.
- c6133d0c9814413d8198ed747285363005d95324 — test(staging): prepara Auth RLS e Preview com isolamento. 10 arquivos: docs/HOMOLOGACAO-REAL-ERP-MOTOBOY.md; scripts/homologacao-pg17/executar.ps1; scripts/homologacao-pg17/instalacao-limpa.txt; scripts/homologacao-pg17/staging-usuarios-sinteticos.sql; scripts/homologacao-staging-fixture.sql; scripts/homologar-auth-staging.mjs; scripts/homologar-auth-staging.test.mjs; src/lib/staging-runtime.ts; src/server.ts; vite.staging.config.ts.

App / feat/app-motoboy-integracao-m3-a:
- c2154d41c2efd0154f2cc0553ff043fb129784aa — feat(motoboy): isola staging e coleta localizacao por rota. 5 arquivos: scripts/motoboy-rotas-erp.test.mjs; src/motoboy-local/app-motoboy-local.tsx; src/motoboy-local/rotas-erp.ts; src/motoboy-local/coleta-localizacao-rota.tsx; vite.motoboy-local.config.ts.

Seleção explícita, diff integral e verificações do índice conferidos antes dos commits. Nenhum segredo, log ou arquivo histórico foi incluído. O relatório de continuação permanece não rastreado, como anteriormente, e foi atualizado sem adicionar outros arquivos ao índice.

### Validações e limites

Nesta consolidação, passaram novamente 7/7 entradas no runner Node do ERP (isolamento staging, UI/GPS e suíte de bloqueios) e 22/22 no App (contratos, operações e suíte M3-B1). Passou a análise sintática PowerShell de executar.ps1. git diff --check e git diff --cached --check passaram nos dois repositórios, inclusive após os commits. Typechecks, builds candidatos fictícios e PostgreSQL 17 até 0122 são os resultados já registrados acima para o mesmo código; não foram repetidos nesta consolidação, que não alterou o código funcional.

Auth/PostgREST/RLS reais, E2E remoto, aprovação visual do novo painel RPC, GPS em aparelhos e segundo plano continuam NÃO HOMOLOGADOS. A suíte PostgreSQL usa papéis/claims sintéticos e não substitui esses testes. Os clusters temporários e diretórios anteriores foram preservados.

Estado final: ERP HEAD c6133d0c9814413d8198ed747285363005d95324, índice vazio, 277 arquivos não rastreados e somente cinco alterações rastreadas preexistentes: AGENTS.md, docs/erp-dark/prints/central-entregas-DEPOIS-celular.png, docs/erp-dark/prints/central-entregas-DEPOIS.png, docs/reembolsos-estornos/capturas-origens/central-com-novas-solicitacoes.png e supabase/.temp/cli-latest. App HEAD c2154d41c2efd0154f2cc0553ff043fb129784aa, índice vazio, nenhum rastreado modificado e nove não rastreados históricos preservados. Nenhum push, deploy, recurso externo ou serviço pago criado.

### Próximo passo exato

Obter autorização e referência de um NOVO Supabase independente, após confirmar cota/custo; não reutilizar o existente nem presumir que o nome do projeto prova isolamento. O roteiro docs/HOMOLOGACAO-REAL-ERP-MOTOBOY.md descreve estrutura revisada até 0122, oito usuários sintéticos, fixture, cutover somente no staging e Preview com variáveis próprias. Não copiar dados, usuários Auth ou arquivos reais para a homologação funcional.

Após disponibilizar e confirmar esse staging e aplicar sua estrutura/fixture com autorização específica, guardar credenciais exclusivamente em arquivo privado externo aos repositórios e executar no PowerShell:

```powershell
Set-Location 'C:\Users\User\ERP-NEIA-SALGADOS'
$env:NEIA_STAGING_REF_AUTORIZADA = '<referencia independente confirmada>'
$env:NEIA_STAGING_CONFIG = '<caminho absoluto do arquivo privado>'
node .\scripts\homologar-auth-staging.mjs
```

O roteiro também documenta o backup futuro do banco/roles/Auth/histórico, bytes de Storage e configurações, com cópias protegidas e ensaio de restauração. Backup e restauração ainda NÃO foram executados. Antes de atualizar o banco existente: inventário efetivo de migrations, backup comprovado, ensaio isolado, revisão de dados históricos e autorização da lista incremental exata. Não usar o manifesto de instalação limpa como atualização produtiva nem apagar registros para satisfazer constraints. A retomada deve começar pela autorização do staging independente, sem repetir correções e auditorias locais concluídas.

## Fase GPS + integração + experiência do cliente — 17/11/2026 (OpenCode)

### Fase 1 — GPS (concluída localmente)

- Revisão da implementação existente: App (`src/motoboy-local/coleta-localizacao-rota.tsx` + RPC `registrar_localizacao_rota` da 0122) e Central (`consultar_localizacao_entrega`/`consultar_localizacoes_entregas`, janela de 90 s; limpeza por trigger ao encerrar rota).
- Refatoração testável: nova `src/motoboy-local/monitor-localizacao-rota.ts` com ambiente injetável (geolocalização, visibilidade, rede, relógio); o componente passou a ser wrapper fino, mesmo comportamento e layout, sem mudança de CSS.
- Novos testes de comportamento `scripts/motoboy-monitor-localizacao.test.mjs` (10/10): permissão negada (código 1), sinal ruim (2/3), desconexão informa estado e não envia, tela em segundo plano não envia, amostra com mais de 60 s rejeitada (expiração), precisão > 1000 m rejeitada, frequência limitada a 15 s, recusa da Central e falha de rede não travam o monitor, parar interrompe e chama clearWatch.
- Novos casos SQL em `scripts/homologacao-pg17/motoboy-corte-gps.sql`: posição futura rejeitada, precisão > 1000 m rejeitada e, principalmente, expiração da LEITURA (amostra com mais de 90 s não é mais devolvida à Central).
- `executar.ps1` endurecido: `Run-Sql` não aborta por WARNING do psql em Windows PowerShell 5.1 (apenas exit code decide a falha). Antes disso, a rodada parava no warning do `plataforma-sintetica.sql`.
- Compatibilidade Android/iOS: segue somente primeiro plano via navigator.geolocation padrão; segundo plano exige integração nativa e aparelhos físicos — continua NÃO homologado.

### Fase 2 — Testes integrados (concluída localmente)

- Novo `scripts/homologacao-pg17/fluxo-completo-rota.sql` (registrado no runner entre `financeiro-motoboy-concorrencia.sql` e `motoboy-corte-gps.sql`), fixture própria: Central atribui rota de 3 pedidos a motoboy novo → ERP confirma recebimentos no ledger → motoboy aceita → retira os 3 → inicia → retorno recusado com pendentes (`rota_com_pendentes`) → entregas individuais (prova que uma entrega não conclui as demais; repetição idempotente) → retorno → chegada → solicita acerto → Caixa confere de forma independente (divergência destacada, depois contagem correta 25905 centavos = 23550 produtos + 2355 taxas) → autoaprovação negada → responsável distinto aprova (taxas R$ 23,55) → turno R$ 63,55 (fixo 40 + taxas) → responsável autoriza → Financeiro registra o pagamento (idempotente, conta única paga) → GPS da rota concluída inelegível. 14 casos F1–F14.
- Homologação completa em PostgreSQL 17 descartável (porta 55464, cadeia até 0122 + regressões + rotas-app + integridade/concorrência + impressão + fechamento + segurança + pagamento + concorrência + fluxo completo + corte/GPS): PASSOU. Log local em `C:\Users\User\Documents\Codex\neia-pg17-f8595acddf204e03af8da6a151f8b897\sql.log`.
- Testes Auth/PostgREST/RLS para staging futuro permanecem preparados (`scripts/homologar-auth-staging.mjs` + fixture); nenhum Supabase foi acessado nesta execução.

### Fase 3 — Experiência do cliente (verificada, sem correção necessária)

- Checkout rápido e endereço inteligente (0103), "Repetir pedido"/"Repetir pedido habitual" e avaliação pós-entrega já existem (`src/routes/conta.tsx`); recuperação de carrinho via localStorage (`neia-carrinho` em `src/lib/cart.tsx`) e CRM (`carrinho_recuperacao_ativa`).
- Suítes pertinentes passaram: fases.test.mjs (134/0), criacao-atomica-wrapper e reserva-integracao (casos locais), central-pedidos.test.mjs. Nenhum problema local comprovado a corrigir; layouts aprovados preservados.

### Fase 4 — Qualidade

- ERP: typecheck e build (Nitro) passaram; `git diff --check` e `git diff --cached --check` limpos; HEAD c6133d0c9814413d8198ed747285363005d95324, sem commit nesta execução.
- App: typecheck, build Vite (2,4 s) e testes passaram (monitor 10/10, rotas-erp 6/6, operações 15/15, M3-B1 9/9); `git diff --check` limpo; HEAD c2154d41c2efd0154f2cc0553ff043fb129784aa, sem commit nesta execução.

### Arquivos alterados nesta execução (não commitados)

- App: `src/motoboy-local/monitor-localizacao-rota.ts` (novo), `src/motoboy-local/coleta-localizacao-rota.tsx` (refatorado), `scripts/motoboy-monitor-localizacao.test.mjs` (novo).
- ERP: `scripts/homologacao-pg17/motoboy-corte-gps.sql` (casos novos), `scripts/homologacao-pg17/fluxo-completo-rota.sql` (novo), `scripts/homologacao-pg17/executar.ps1` (Run-Sql resiliente + registro do fluxo completo), este relatório.
- Migrations não alteradas; nenhum Supabase, .env, push, deploy ou pagamento real acessado.

### Pendências reais (não homologadas)

- Staging Supabase independente autorizado (Auth/PostgREST/RLS reais) — continua bloqueando E2E e cutover; o runner de staging está pronto e aguarda referência confirmada.
- GPS em segundo plano e impressão física exigem aparelhos reais; o Android existente é o leitor Pix, separado do App Motoboy.
- Corte do legado `src/routes/motoboy.tsx` (9 escritas diretas) apenas com 0122 ativo após cutover homologado.


## Continuação Codex — liberação da Central e GPS — 17/11/2026

Este registro atualiza a entrega anterior do OpenCode. Não reiniciar auditorias nem reimplementar os fluxos concluídos. A 0111 permanece versionada sem modificação; a regra definitiva foi adaptada pela migration incremental 0123_liberacao_rota_pela_central.sql.

### Funcionamento corrigido

- Central atribui a rota de até três pedidos; o App a recebe sem aceite manual e atualiza a consulta a cada 15 segundos. Foi removido o botão e a operação de aceite da tela. A RPC aceitar_rota continua apenas para compatibilidade, validando propriedade sem alterar aceites históricos nem liberar a saída.
- Central (admin ou producao, sem papel motoboy e diferente do entregador) chama liberar_rota_entrega. Autor, horário, motoboy e composição dos pedidos ficam registrados na rota. A liberação é idempotente, serializada com locks e protegida contra escrita direta por authenticated/anon. Não há liberação retroativa de rotas em preparação.
- Motoboy confirma a retirada de cada pedido; iniciar_rota exige prova válida de TODOS os pedidos e liberação da Central para exatamente a mesma composição e motoboy. Retirada parcial, rota vazia, prova alheia, falta de liberação e composição alterada continuam bloqueadas. Rotas já em trânsito conservam os horários e a resposta idempotente.
- Central passa a exibir as rotas em preparação no modo RPC e oferece Liberar saída. RPC/colunas ausentes não geram sucesso fictício; início fica desabilitado no App sem os campos de liberação/retirada. O modo legado operacional continua separado pelo interruptor existente; não ativado remotamente.
- Preservada a extração do monitor GPS feita pelo OpenCode. Corrigidos amostras futuras, coordenadas/precisão inválidas, continuação após permissão negada e acúmulo de requisições. Consentimento fica associado à rota. Troca de usuário desmonta a tela e seu monitor; consultas antigas não atualizam a nova sessão. ERP e App usam a mesma lógica testada em seus repositórios.
- Corrigido um falso positivo no teste de expiração GPS: anteriormente a consulta era feita depois da entrega, quando já estava oculta pelo status. Agora a posição expira com pedido ainda em rota, tanto para cliente quanto para Central, volta a ser consultável quando recente e deixa de ser visível após a entrega/encerramento.

### Testes reais e locais concluídos

PASSOU PostgreSQL 17.11 nativo descartável, porta 55469, cadeia selecionada até 0123. Aplicação e 13 arquivos: regressoes.sql; rotas-app.sql; inicio-rota-integridade.sql; inicio-rota-concorrencia.sql; impressao.sql; fechamento-turno.sql; seguranca-financeira-motoboy.sql; pagamento-turno.sql; financeiro-motoboy-concorrencia.sql; liberacao-central.sql; liberacao-central-concorrencia.sql; fluxo-completo-rota.sql; motoboy-corte-gps.sql.

As duas sessões de banco reais verificaram disputa por locks no início, última retirada, aprovação/pagamento e liberação. Passaram rollback de início e liberação, repetição idempotente, rotas de 1–3 pedidos, liberação por Produção, negação ao motoboy e Financeiro, preservação de aceites antigos e rejeição de composição alterada. O fluxo integrado de 14 etapas agora executa sem aceite: atribuição/liberação, retirada, início, entregas individuais, retorno/chegada, conferência independente, aprovação distinta e confirmação financeira. Permissões SQL foram exercitadas com SET ROLE authenticated e claims sintéticas. Isso NÃO comprova Supabase Auth/PostgREST/RLS reais.

Log da rodada final: C:\Users\User\Documents\Codex\neia-pg17-4c78386893bd48d8a1aad6b7a47b6f18\sql.log. Uma rodada anterior também passou na porta 55468. Duas tentativas anteriores falharam em sintaxe da fixture financeira acrescentada nesta execução, corrigida antes da aprovação final; não foi falha financeira do produto. A tentativa inicial de processos no ambiente restrito foi interrompida por não avançar; os testes seguintes rodaram com autorização temporária de execução. Portas 55465–55469 foram conferidas sem resposta ao final. Diretórios antigos e os criados nesta execução foram preservados.

PASSOU ERP: 23/23 entradas Node do lote GPS/Central/conciliação/isolamento e 31/31 das regressões de competência, pagamentos parciais, Financeiro e bloqueios (54 no total). PASSOU App: 36/36 entradas Node, incluindo a suíte M3-B1 com nove verificações internas. O monitor passou em 13 casos em cada repositório, preservando os dez testes do OpenCode e acrescentando três. Passaram typecheck dos dois projetos, build Vite/Nitro ERP por vite.staging.config.ts e build Vite do App por vite.motoboy-local.config.ts com destino/chave fictícios explícitos e sem leitura automática de .env. Passaram análise sintática PowerShell, git diff --check e git diff --cached --check.

O build ERP gerou .vercel/output/nitro.json. A varredura dos arquivos JS/MJS/HTML gerados, sem imprimir valores sensíveis, encontrou zero URLs das duas referências produtivas bloqueadas (353 arquivos ERP e cinco App). Isso é uma verificação adicional do pacote fictício, não substitui a validação do runtime em staging. Os builds mantêm avisos não impeditivos sobre tamanho de chunks e um arquivo auxiliar de preview sem export de Route; não foram alteradas áreas alheias para removê-los.

Regras financeiras preservadas e exercitadas pelas regressões: dinheiro/Pix separados, conferência do Caixa baseada no ERP/ledger, aprovação por outra pessoa, taxas aprovadas pagas no turno, fixo 40 ou 60 em 24/12, confirmação autorizada do Financeiro, idempotência e ausência de lançamentos duplicados. Nenhuma cobrança ou transferência real foi realizada. Reembolso de troco próprio permanece bloqueado até fluxo autorizado com comprovante.

### Commits locais e arquivos exatos

ERP / homologacao-finalizacao:
- dd89672ee7616ce4b7889d636b5b6a4cfd8009c0 — fix(gps): valida amostras e encerra coleta sem permissao (cinco arquivos).
- d864af2daa5de97dbaf6900c330eb2c8dc5cc5ea — feat(entregas): exige liberacao da Central sem aceite do motoboy (12 arquivos, HEAD final).

App / feat/app-motoboy-integracao-m3-a:
- f7c1740975e684986aa244a5dda1e495b7a8974d — fix(motoboy): protege consentimento e monitor de localizacao (três arquivos).
- d5b68870f04e9440f5c3ca38f18201c6f06838d6 — feat(motoboy): recebe rotas e aguarda liberacao da Central (três arquivos, HEAD final).

ERP GPS: scripts/homologacao-pg17/motoboy-corte-gps.sql; scripts/motoboy-corte-ui.test.mjs; scripts/motoboy-monitor-localizacao.test.mjs; src/components/admin/coleta-localizacao-rota.tsx; src/components/admin/monitor-localizacao-rota.ts.

ERP integração: drizzle/migrations/0123_liberacao_rota_pela_central.sql; scripts/homologacao-pg17/executar.ps1; scripts/homologacao-pg17/fechamento-turno.sql; scripts/homologacao-pg17/inicio-rota-integridade.sql; scripts/homologacao-pg17/instalacao-limpa.txt; scripts/homologacao-pg17/fluxo-completo-rota.sql; scripts/homologacao-pg17/liberacao-central.sql; scripts/homologacao-pg17/liberacao-central-concorrencia.sql; scripts/homologar-auth-staging.mjs; src/components/admin/painel-motoboy-rpc.tsx; src/routes/central-entregas.tsx; docs/HOMOLOGACAO-REAL-ERP-MOTOBOY.md.

App GPS: scripts/motoboy-monitor-localizacao.test.mjs; src/motoboy-local/coleta-localizacao-rota.tsx; src/motoboy-local/monitor-localizacao-rota.ts.

App integração: src/motoboy-local/app-motoboy-local.tsx; src/motoboy-local/rotas-erp.ts; scripts/motoboy-rotas-erp.test.mjs.

Todos os lotes tiveram seleção explícita e revisão do diff preparado, sem add geral. Índices finais vazios. ERP conserva somente as cinco modificações rastreadas históricas: AGENTS.md, os três PNGs anteriores e supabase/.temp/cli-latest; 277 não rastreados, incluindo este relatório. App sem modificações rastreadas, nove não rastreados históricos preservados (incluindo serviço/teste M3-B1). O relatório permanece não rastreado como anteriormente. Nenhum .env, segredo, log, arquivo temporário ou proteção de produção foi incluído nos commits. Nenhum push ou deploy.

### Bloqueios reais e próximo passo exato

1. Não foi identificada na documentação uma referência Supabase independente previamente autorizada. O projeto neia-salgados-staging usa a referência protegida que contém dados reais e NÃO pode ser usado. Nenhum Supabase remoto foi acessado nesta rodada. Disponibilidade da cota Free e custo da conta não foram consultados remotamente; precisam ser confirmados antes de qualquer criação. Não criar recurso pago ou reaproveitar o projeto existente.
2. Próxima ação do proprietário: autorizar a criação/designar um projeto separado e confirmar a nova referência e cota/custo. Seguir docs/HOMOLOGACAO-REAL-ERP-MOTOBOY.md: estrutura revisada até 0123, oito usuários fictícios, fixture própria, credenciais fora do Git, API de Auth/PostgREST/RLS, modo de corte somente nesse staging. Não copiar dados pessoais reais. A configuração fictícia usada no build NÃO é um Supabase funcional.
3. Somente após isso executar a suíte remota, E2E autenticado e aprovação visual ERP/App em Preview autorizado. Esta rodada não publicou Preview. Revalidar motoboys A/B, Central, Caixa, responsável e Financeiro. Instalar 0123 antes dos novos frontends; aceitar_rota não é mais etapa operacional. Preparar tratamento supervisionado para rotas em preparação e revisão de composições alteradas, preservando as provas de liberação.
4. Permanecem NÃO TESTADOS: GPS em aparelhos/segundo plano Android/iOS, impressora física, provedores de pagamentos/WhatsApp e E2E com Supabase real. O App é web em primeiro plano; o Android existente é leitor Pix. Integração nativa exige decisão de arquitetura, ferramentas/assinaturas e aparelhos. Não afirmar homologação de hardware com testes simulados.
5. Antes de produção: backup completo verificável com ensaio de restauração (banco, Auth, Storage e configurações), inventário real de migrations, lista incremental aprovada, compatibilidade de dados históricos, plano de rollback/reconciliação e autorização específica de cutover. A versão candidata local é o par de HEADs acima, ainda sem aprovação para produção.

Para repetir a regressão PostgreSQL no Windows, usando porta livre e sempre novo diretório descartável:

```powershell
Set-Location 'C:\Users\User\ERP-NEIA-SALGADOS'
& .\scripts\homologacao-pg17\executar.ps1 -Scratch 'C:\Users\User\Documents\Codex' -Port 55469
```

Após staging independente autorizado e preparado, a suíte remota usa NEIA_STAGING_REF_AUTORIZADA e NEIA_STAGING_CONFIG (arquivo privado fora dos repositórios), seguida de node .\scripts\homologar-auth-staging.mjs. Não preencher essas variáveis com referências produtivas. Preservar todas as modificações históricas e não repetir as auditorias já encerradas.


## Supabase local — diagnóstico e preparação — 17/11/2026

## Resultado desta execução

O ambiente Supabase completo NÃO iniciou e Auth/PostgREST/RLS reais NÃO foram testados. Não houve instalação de software, criação de projeto na nuvem, consulta aos dois projetos hospedados, migration remota, operação financeira, push, deploy ou commit. O código dos aplicativos não foi alterado.

## Evidência do Windows

- Windows 11 Pro x64, build 26300.
- AMD Athlon 3000G: VMMonitorModeExtensions=true, SecondLevelAddressTranslationExtensions=true, VirtualizationFirmwareEnabled=false. HypervisorPresent=false. O processador informa suporte, mas a virtualização não está habilitada no firmware.
- 7,9 GB de RAM e 75,6 GB livres no volume C na consulta. O uso dos componentes opcionais deve ser reduzido/observado depois do desbloqueio; não foi recomendada compra de hardware.
- Docker Desktop já instalado e cliente Docker 29.9.2 disponível. Contexto desktop-linux. Uma inicialização normal do Desktop foi solicitada. O Desktop abriu; o motor Linux não ficou operacional.
- Erro inicial: failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine; open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.
- Depois de abrir o Desktop: request returned 500 Internal Server Error for API route and version http://%2F%2F.%2Fpipe%2FdockerDesktopLinuxEngine/v1.56/info, check if the server supports the requested API version.
- Diagnóstico específico do backend: No virtualization available; Wsl/Service/RegisterDistro/CreateVm/HCS/HCS_E_HYPERV_NOT_INSTALLED; Please enable the Virtual Machine Platform optional component and ensure virtualization is enabled in the BIOS.
- A existência do pipe não significa daemon pronto. O teste futuro deve exigir resposta válida com ServerVersion e OSType=linux, não apenas presença do executável ou código de saída zero.
- WSL está instalado, informa padrão 2 e seu serviço está em execução. Isso não comprova que uma VM WSL2 inicia.
- Podman não foi encontrado; não foi instalado. Sua instalação no Windows não elimina a necessidade de virtualização para os containers Linux.
- Supabase CLI 2.122.0 disponível. Apenas init e comandos de ajuda foram usados para a preparação local. Não foi atualizada a CLI. A compatibilidade completa com os serviços depende de iniciar e testar o motor.
- A leitura de VirtualMachinePlatform e Microsoft-Windows-Subsystem-Linux com Get-WindowsOptionalFeature retornou: A operação solicitada requer elevação. O estado desses recursos não foi presumido nem modificado. A autorização temporária de execução do agente não equivale a uma sessão administrativa do Windows.

## Preparação segura realizada

Foi gerado pelo supabase init um esqueleto NOVO, fora dos repositórios:

C:\Users\User\Documents\Codex\2026-11-16\code-review-guidelines-coordinate-a-private\work\neia-supabase-local-3895d451


- project_id exclusivo: neia-supabase-local-3895d451. Não corresponde a qualquer projeto remoto. Não existe .temp/project-ref nesse esqueleto.
- Configuração independente em supabase/config.toml; o supabase/config.toml do ERP, que contém referência protegida antiga, NÃO foi alterado ou utilizado para iniciar serviços.
- PostgreSQL major 17; portas propostas 55471 API, 55472 banco, 55473 Studio e 55474 e-mail local; sombra 55470 e pooler desativado em 55479. Nenhum listener nessas portas foi encontrado na consulta. A porta precisa ser conferida novamente antes de iniciar.
- Migrations e seeds automáticos desativados, sem cópia cega das migrations históricas. Edge Runtime e Analytics desativados para a homologação inicial. Nenhuma variável de credencial externa é herdada nesse arquivo novo.
- MANIFESTO-ORIGEM.txt registra os 113 arquivos na ordem do manifesto revisado, terminando em 0123_liberacao_rota_pela_central.sql. Todos os caminhos de origem foram conferidos como existentes. O manifesto é para instalação limpa e não deve ser aplicado a um banco com dados existentes.
- A configuração passou nas verificações estruturais de identidade, portas e ausência das três referências hospedadas conhecidas. Não havia parser TOML separado disponível; não foi instalado outro. A leitura completa pelo runtime Supabase continua pendente. Não declarar o esqueleto como stack funcionando.
- Nenhum container Supabase, volume de banco ou usuário Auth foi criado. Nenhum serviço local foi exposto publicamente.

## Desbloqueio gratuito — depende do proprietário

1. Salvar o trabalho antes de qualquer reinício. Na UEFI/BIOS, o proprietário deve habilitar a virtualização AMD-V/SVM seguindo o manual da placa-mãe; não mudar Secure Boot, TPM, senhas, antivírus ou outras configurações.
2. Autorizar uma verificação administrativa somente dos recursos Virtual Machine Platform e Windows Subsystem for Linux. Se estiverem desativados, habilitá-los apenas após aprovação e combinar o reinício. Não alterar BCD nem desativar proteções como tentativa genérica.
3. Após o reinício aprovado, verificar VirtualizationFirmwareEnabled=true, iniciar Docker Desktop normalmente e exigir docker info com motor Linux saudável. Não repetir tentativas de Supabase enquanto o Docker estiver indisponível.
4. Se houver necessidade comprovada de atualizar WSL/CLI ou baixar outro componente, apresentar versão/fonte/custo e pedir autorização antes. Não instalar Podman ou reinstalar Docker como tentativa de contornar virtualização desativada.

Referências oficiais: [Microsoft: virtualização no Windows](https://support.microsoft.com/en-gb/windows/experience/enable-virtualization-on-windows?nochrome=true), [Microsoft: erros WSL](https://learn.microsoft.com/en-us/windows/wsl/troubleshooting), [Docker: requisitos Windows](https://docs.docker.com/desktop/setup/install/windows-install/).

## Sequência após o motor estar disponível

1. Reutilizar o esqueleto acima, nunca executar comandos locais no diretório supabase do ERP. Confirmar identidade, inexistência de vínculo e portas livres. Conferir a versão real do PostgreSQL da imagem.
2. Criar rede Docker exclusiva com opção com.docker.network.bridge.host_binding_ipv4=127.0.0.1 e iniciar usando --workdir e --network-id explícitos. Não usar rede já existente de outro sistema. Antes de continuar, inspecionar todos os bindings e parar a homologação se qualquer serviço estiver exposto fora do loopback. Não alterar ou remover containers, redes ou volumes preexistentes.
3. Antes da primeira inicialização, aprovar o download das imagens oficiais que não estejam disponíveis localmente. Manter saída de status/chaves em armazenamento privado; não publicar valores na conversa ou Git.
4. Conferir no banco local o cluster, porta, identidade sintética e ausência de dados operacionais. Usar Auth, roles e Storage REAIS fornecidos pelo Supabase local, sem plataforma-sintetica.sql ou INSERT direto em auth.users.
5. Aplicar SOMENTE nesse banco vazio os 113 arquivos do manifesto revisado, respeitando a ordem, exceções transacionais já documentadas e correções históricas. Parar na primeira divergência de schema/roles/extensões; não remover objetos históricos para fazer a instalação passar. Não usar link, db push, db pull, --linked ou --db-url remoto.
6. Criar exatamente oito usuários fictícios pelo Auth Admin LOCAL (cliente, atendente, producao, caixa, financeiro, responsavel, motoboyA e motoboyB), confirmados, com senhas de teste privadas e diferentes. A credencial administrativa local fica somente no bootstrap; nunca nos frontends. Verificar que auth.users contém somente essas oito contas antes da fixture.
7. Aplicar homologacao-staging-fixture.sql no banco local com identificador sintético de 20 caracteres, protocolo próprio e dados fictícios. Habilitar o interruptor de corte somente nesse ambiente de testes após instalar 0123. Preservar a prova de que o alvo é local antes de qualquer SQL de fixture.
8. Adaptar e testar um modo LOCAL explícito para homologar-auth-staging.mjs: o runner atual aceita somente HTTPS de referência Supabase remota e NÃO aceita loopback. Não forjar hostname e não enfraquecer validarConfiguracao. O modo local deve aceitar exclusivamente http://127.0.0.1:55471, chave pública local (publishable ou JWT anon validado), marcador da fixture e os oito usuários. Bloquear redirecionamentos, URLs remotas e chave service_role no cliente dos testes.
9. Preparar uma configuração Vite LOCAL exclusiva para o ERP, com envDir=false e destino de loopback rigoroso. vite.staging.config.ts permanece restrito à nuvem; não alterar suas proteções para aceitar qualquer host. O App já permite loopback por vite.motoboy-local.config.ts, sem MOTOBOY_STAGING_REF_AUTORIZADA. Usar variáveis temporárias do processo e preservar todos os .env existentes.
10. Executar Auth real, PostgREST e RLS por usuário não privilegiado, incluindo motoboys A/B, Caixa/Financeiro, responsável e Central. Verificar atribuição, liberação exclusiva da Central, retiradas completas, início, entregas individuais, retorno, conferência independente, aprovação distinta, pagamento simulado e ledger, além de negações, concorrência e rollback aplicáveis.
11. Abrir ERP e App no navegador local, exercitar sessões reais e permissões, então executar regressões, typecheck, builds e diff-check pertinentes às adaptações. Registrar versões exatas dos serviços e diferenças. Não usar credenciais administrativas no E2E.

Não foram produzidos comandos de escrita genéricos enquanto não existe um banco local identificável e pronto. O roteiro mantém a verificação do alvo antes da aplicação de SQL.

## O que está e não está homologado

| Item | Estado |
|---|---|
| PostgreSQL 17.11 até 0123, transações e concorrência | PASSOU na execução anterior; não repetido nesta rodada |
| ERP 54/54, App 36/36, typechecks e builds | Resultados anteriores preservados; código dos apps sem alteração nesta rodada |
| Esqueleto local e ordem de 113 arquivos | PREPARADO; verificações estruturais passaram |
| Supabase completo local | BLOQUEADO por virtualização/daemon Linux |
| Oito usuários no Auth real local | NÃO CRIADOS |
| Auth/PostgREST/RLS reais locais | NÃO TESTADOS |
| ERP/App autenticados e fluxo pelo navegador local | NÃO TESTADOS |
| Regressoes/typechecks/builds desta rodada | NÃO REPETIDOS; nenhuma alteração no código dos aplicativos |

## Diferenças e publicação

Supabase local inclui Auth/PostgREST/RLS reais e pode comprovar contratos e isolamento sem hospedagem paga. Isso não prova o roteamento HTTPS, variáveis de runtime Vercel, SMTP/OAuth externos, limites/versões do projeto hospedado, rede pública, provedores de pagamentos/WhatsApp, impressão física ou GPS em dispositivos. Um Preview Vercel na nuvem não alcança o 127.0.0.1 do computador; não abrir túnel público como atalho.

Após homologação local, a revisão final hospedada/representativa e autorização de publicação continuam necessárias. Preservar os dois projetos existentes, inventariar o histórico real somente com autorização, ensaiar backup/recuperação, revisar migrations incrementais e aprovar o cutover antes de qualquer ação produtiva.

Alternativas gratuitas: (a) habilitar os recursos já presentes de virtualização e usar este Windows após autorização; (b) usar um computador Linux disponível, onde o runtime nativo oficial tem suporte, com instalação/download previamente autorizados; (c) continuar os testes SQL com o PostgreSQL 17 nativo já instalado. A alternativa (c) não substitui Auth/PostgREST/RLS e não gera aprovação falsa do Supabase completo. O runtime nativo oficial do Supabase não é suportado diretamente no Windows: [documentação](https://supabase.com/docs/guides/local-development/docker-and-native-runtimes).

## Preservação e retomada

ERP: homologacao-finalizacao, HEAD d864af2daa5de97dbaf6900c330eb2c8dc5cc5ea. App: feat/app-motoboy-integracao-m3-a, HEAD d5b68870f04e9440f5c3ca38f18201c6f06838d6. Commits e índices preservados. Modificados somente os dois relatórios autorizados no ERP; código, AGENTS.md, PNGs, .env, supabase/.temp/cli-latest e históricos não foram editados. O esqueleto ficou fora dos repositórios.

Próxima ação necessária: proprietário habilitar SVM na UEFI/BIOS e autorizar a verificação administrativa dos dois recursos Windows, com habilitação apenas se necessária e reinício combinado. Depois, retomar da validação do daemon, sem refazer as auditorias do ERP e sem acessar os projetos hospedados.


## Preparação offline concluída — 17/11/2026 — sem acesso à senha

**Estado ativo desta retomada:** proprietário fora do computador. Backup completo de lflzlcqinarrcgncafol, arquivos Storage e restauração desse backup continuam PENDENTES. Nenhum acesso remoto ou a dados reais nesta execução. Esta seção substitui instruções anteriores de aguardar senha, instalar ferramentas, reabrir PowerShell interativo ou executar o runner remoto sem confirmação de escrita.

### Preservação e estados

- ERP: homologacao-finalizacao, HEAD d864af2daa5de97dbaf6900c330eb2c8dc5cc5ea.
- App: feat/app-motoboy-integracao-m3-a, HEAD d5b68870f04e9440f5c3ca38f18201c6f06838d6.
- Índices vazios. Nenhum commit, push, deploy, instalação, configuração do Windows, migration remota, alteração de Supabase/RLS/usuários ou recuperação de credenciais.
- Encerrados SOMENTE pwsh 25768 e seu pg_dump 8492, após conferir o script, parentesco e estágio aguardando senha. Nenhuma nova autenticação. Estado local: SUSPENDED_NO_PASSWORD.
- Pasta incompleta anterior preservada: C:\Users\User\ERP-NEIA-BACKUPS\LFL-NATIVO-20261117-205843-0ea38ab5. O database-full.dump vazio NÃO é backup utilizável. Não apagar nem usar como entrada de restauração.
- Preservados AGENTS.md, três PNGs, .env, supabase/.temp/cli-latest, scripts/commit-seguro.ps1, históricos e trabalho do App.
- Referências ruioyioynwwwiqbjznoa e iqirsunzgavsuhgyjjsi continuam protegidas. lflzlcqinarrcgncafol permanece autorizado somente para leitura/backup, NÃO para Auth/login, fixtures ou testes de escrita.

### Correções locais efetivas

1. scripts/homologar-auth-staging.mjs:
   - Sem argumentos ou com --validar-config: validação local, sem criar cliente, login ou requisição.
   - --executar exige NEIA_STAGING_ESCRITAS_AUTORIZADAS exatamente igual à referência autorizada, além dos guardas anteriores. Uma autorização de leitura não autoriza a homologação mutável.
   - O parâmetro programático autorizacaoEscrita também é obrigatório antes do Auth.
   - Mantidos bloqueio dos projetos produtivos, chave publishable, destino HTTPS fixo, redirects proibidos e marcador por usuário.
   - Mensagem financeira descreve conferência independente e aprovação distinta; não promete separação de papéis que o enum atual não possui.
2. scripts/homologar-auth-staging.test.mjs:
   - Testes de modo offline, ausência de rede/cliente sem autorização, CLI segura por padrão e fluxo de contratos 0123 sem aceitar_rota.
   - Mock percorre retirada, liberação pela Produção/Central, início idempotente, entrega, GPS, retorno, conferência, aprovação e pagamento. Isso testa o runner, NÃO Auth/RLS ou concorrência reais do Supabase.
3. Novos scripts/homologacao-pg17/restaurar-backup-local.ps1 e restaurar-backup-local.test.ps1:
   - Modo padrão apenas prepara, sem senha, banco ou leitura do conteúdo de backups.
   - Execução real exige -ExecutarRestauracao, BackupDirectory e Scratch explícitos.
   - Aceita pacote EXPORTS_READY do lfl ou de teste synthetic-local; valida manifestos, tamanhos e hashes; recusa arquivos vazios, links e pacotes incompletos.
   - Cria cluster novo, privado, SCRAM, somente 127.0.0.1; verifica data_directory antes de escrever e mantém preload vazio. Não usa bancos/serviços preexistentes.
   - Restaura papéis sem senhas e dump uma única vez, com erro fatal e transação. Nunca restaura subscriptions ou conecta ao Supabase.
   - Corrigida a criação de public: remove somente o schema vazio recém-criado quando o arquivo realmente contém sua recriação.
   - Compara as seções COPY do próprio dump com as tabelas restauradas: contagens e SHA-256, incluindo vazios, ordem e duplicatas. Confere catálogo de índices, constraints, funções, triggers, policies e grants.
   - Extensões não suportadas, incluindo pg_cron e supabase_vault, bloqueiam o procedimento ANTES da criação do cluster. Não são instaladas ou omitidas para forçar sucesso.
   - Os clusters criados pelo ensaio são encerrados no finally; seus diretórios sintéticos foram preservados.

### Procedimento de backup revisado fora dos repositórios

Entregáveis em:
C:\Users\User\Documents\Codex\2026-11-16\code-review-guidelines-coordinate-a-private\outputs

- backup-lfl-cliente-postgres.ps1 agora é seguro por padrão: sem flags ou com -ValidarPreparacao não conecta, não pergunta senha, não cria pasta e não exporta.
- A execução presencial exige -ExecutarBackup e terminal interativo. A senha é recebida SOMENTE pelo prompt nativo -W dos clientes PostgreSQL, sem captura no PowerShell, variável PGPASSWORD preenchida pelo script, argumentos, histórico ou relatórios.
- O ambiente de destino é aplicado apenas aos processos filhos; o ambiente do PowerShell não fica apontando ao Supabase.
- Host fixo db.lflzlcqinarrcgncafol.supabase.co, porta 5432, banco/usuário postgres, verify-full e default_transaction_read_only=on.
- Qualquer falha interrompe sem repetir autenticação ou ampliar acesso e retorna falha; arquivos parciais são preservados e identificados como não aprovados.
- Pasta nova sob ERP-NEIA-BACKUPS com ACL apenas usuário/SYSTEM; SHA-256 também dos componentes parciais. O inventário não compartilha o snapshot do pg_dump; isso é registrado explicitamente, sem falsa consistência temporal.
- lfl-backup-inventory.sql inclui apenas leitura, contagem de Auth, metadados Storage, catálogo, TLS e inspeção de papéis cli_* sem senhas. Nenhum papel é removido.
- backup-lfl-nativo.ps1 anterior foi substituído por adaptador que só permite -PrepareOnly; o fluxo antigo que recebia senha no PowerShell não deve ser usado. Sua cópia histórica de código foi preservada no work desta conversa, sem segredos.
- outputs/exportar-storage-lfl.cjs é o procedimento canônico do Storage. Sem argumentos apenas prepara, sem ler registros ou fazer rede; exige --executar-exportacao e EXPORTS_READY para os GETs públicos autorizados. Usa nomes locais por hash, caminhos/metadados em manifesto privado, tamanho e SHA-256. Bucket privado ou divergência exige parar esse componente. Não executar a exportação agora. A versão anterior em work foi preservada.
- Usar o novo manifesto PREPARACAO-OFFLINE-SHA256.json; manifestos antigos documentam versões anteriores dos procedimentos.

### Testes executados nesta rodada

| Verificação | Resultado e limite |
|---|---|
| ERP Auth/staging + corte/UI + GPS | 23/23 locais, sem serviços remotos; Auth/staging 8/8 reexecutados após ajuste final de mensagem |
| App scripts/motoboy-rotas-erp.test.mjs | 7/7 locais; App não foi modificado |
| Ensaio de recuperação PostgreSQL 17.11 | 11/11 verificações; SOMENTE dados criados sinteticamente nesta execução |
| Recuperação sintética | 6 tabelas public/auth/storage, contagens e SHA-256 coincidentes; funções, trigger, policy, grants, índices e constraints verificados |
| Integridade negativa | arquivo sintético adulterado recusado antes de criar outro cluster; destino remoto e extensões não suportadas recusados |
| Typecheck ERP | PASSOU |
| git diff --check ERP e App | PASSOU pelo Git do Windows; chamada inicial do ambiente apresentou erro de worktree, sem reparo/configuração |
| Parser dos procedimentos PowerShell | sem erros; execução exige PowerShell 7 já disponível, sem instalação ou mudança de ExecutionPolicy |
| Storage | 8 guardas locais de origem/caminhos passaram; modo padrão sem rede; arquivos reais NÃO exportados |
| Build | não repetido: só scripts de preparação/testes e documentação, sem alteração de bundle/layout |
| Backup/restore real do lfl | PENDENTES; não acessados nesta rodada |
| Auth/PostgREST/RLS/E2E reais | NÃO EXECUTADOS; sem aprovação nova por mocks ou Auth sintético |

Ensaio sintético final:
- Origem: C:\Users\User\Documents\Codex\2026-11-16\code-review-guidelines-coordinate-a-private\work\neia-recovery-418e103a08754cefa496d35eb7a8f251
- Recuperação: C:\Users\User\Documents\Codex\2026-11-16\code-review-guidelines-coordinate-a-private\work\neia-recovery-4923b783e7a748168cf1da1b45657663
- Ambos encerrados, sem postmaster.pid ao conferir. Não apagar diretórios temporários antigos.
- A fixture criou auth.users sintética apenas para testar o mecanismo de backup/restauração; não comprova funcionamento de Supabase Auth, API ou Storage.

### Compatibilidade com 0123 e bloqueios concretos

- Runner e App dispensam aceite manual. Retirada completa e liberação pela Central/Produção precedem início; motoboy não libera a própria rota. A função aceitar_rota mantida no contrato é compatibilidade histórica, não requisito do fluxo novo.
- Os testes SQL anteriores de 1–3 pedidos, concorrência e rollback da 0123 continuam preservados; não foi repetida toda a cadeia de 113 arquivos.
- A fixture scripts/homologacao-staging-fixture.sql continua intencionalmente exigindo projeto sem operação e exatamente oito usuários. NÃO foi enfraquecida. Não funciona sem adaptação para reutilizar o lfl preservando seu usuário antigo.
- Para reuso: oito usuários novos + o existente = pelo menos nove. Preparar fixture específica por IDs/protocolo depois de backup, baseline e schema aprovados. Não apagar usuário antigo ou alterar seus papéis para satisfazer teste.
- Caixa e Financeiro da fixture compartilham app_role=financeiro. Identidades diferentes cobrem autoaprovação, mas NÃO provam separação absoluta das capacidades Caixa/Financeiro. Uma regra mais restrita requer decisão e contrato de autorização próprios; não mudar silenciosamente.
- O lfl observado anteriormente está na base antiga de 69 tabelas, com 29 nomes de tabelas da cadeia revisada ausentes. Não aplicar só 0123 nem executar o manifesto de instalação limpa no banco existente.
- Preservar contenção M24: 0088/0098 podem reabrir grants de RPCs de estoque. Delta e sequência de permissões precisam ser ensaiados e aprovados.
- PostgreSQL nativo instalado não oferece pg_cron/supabase_vault. A recuperação completa desse banco não está comprovada; o ensaio sintético não elimina a necessidade dessas dependências, das configurações externas ou da chave de criptografia de Vault.
- Loopback e cluster dedicado isolam o banco e a entrada de conexões; não equivalem a uma rede isolada contra código SQL não confiável. Inspecionar o SQL do dump antes de qualquer recuperação real. Nenhuma mudança de firewall/Windows foi feita.

### Roteiro de retomada sem repetir auditoria

1. AGORA, apenas offline:
   - PowerShell 7: backup-lfl-cliente-postgres.ps1 -ValidarPreparacao.
   - No ERP: node --import tsx --test scripts/homologar-auth-staging.test.mjs.
   - Com configuração privada já preparada e sem segredos no projeto: node scripts/homologar-auth-staging.mjs --validar-config. Sem --executar não há rede. Não criar credenciais fictícias no remoto agora.
2. QUANDO O PROPRIETÁRIO ESTIVER NO COMPUTADOR E PEDIR RETOMADA:
   - Abrir somente o procedimento nativo com -ExecutarBackup. Confirmar ref/host/porta/usuário e receber senha no PostgreSQL; nunca usar valores enviados no chat, cofre Windows ou redefinição automática.
   - Exportar dump, inventário e papéis acessíveis. Três clientes independentes podem pedir a senha. Parar na primeira falha.
   - Conferir estrutura/cobertura de public/auth/storage, manifesto, hashes, permissões da pasta e Storage separadamente; não chamar exportação parcial de backup completo.
3. DEPOIS DE EXISTIR BACKUP VÁLIDO:
   - A restauração não precisa da senha Supabase, apenas do pacote e de credenciais locais aleatórias geradas pelo procedimento.
   - Validar dependências; resolver a recuperação representativa de pg_cron/Vault e revisar SQL/configurações sem instalar ou enfraquecer proteções automaticamente.
   - Usar restaurar-backup-local.ps1 -ExecutarRestauracao -BackupDirectory <pasta-nova-validada> -Scratch <pasta-fora-do-ERP> -Port <porta-local-livre>.
   - Rodar checks e comparar catálogo/ACLs/funções, linhas, hashes, Auth e metadados Storage. Validar bytes Storage separadamente. Auth/Storage como serviços continuam fora do alcance de PostgreSQL puro.
4. HOMOLOGAÇÃO REAL, SOMENTE APÓS NOVA AUTORIZAÇÃO DE ESCRITA NO LFL:
   - Aprovar delta incremental até 0123 e recuperação; manter projetos protegidos intactos. Não usar db push/link nem replay cego do manifesto.
   - Aprovar criação de oito usuários sintéticos, fixture compatível com legado e dados de teste isolados dos produtos/usuário atuais.
   - Preparar arquivo privado NEIA_STAGING_CONFIG fora dos repositórios com os oito logins de teste, chave publishable, referência e IDs da fixture real. A aplicação não recebe senha de banco ou service_role.
   - Validar offline primeiro. Somente com autorização: --executar e NEIA_STAGING_ESCRITAS_AUTORIZADAS igual à referência, preservando todos os outros guardas.
   - Comprovar Auth/PostgREST/RLS com atores não privilegiados, 1–3 pedidos, negações, independência financeira, idempotência, concorrência, rollback e preservação do legado.
5. E2E ERP + App e Preview/GPS/aparelhos ficam para fases autorizadas; nada de push/deploy nesta rodada.

**O que depende de senha ou presença:** exportação remota interativa precisa da senha vigente e do proprietário no terminal. Restauração local, análise de SQL e comparação de arquivos não precisam dessa senha depois de obtido o pacote, mas precisam das dependências corretas e autorização para usar o backup. Testes Auth/API usam credenciais sintéticas e chave pública, não senha de banco; porém fazem gravações e exigem aprovação separada. Testes físicos/visuais dependem de aparelhos e presença quando aplicáveis.

Próxima tarefa exata: quando o proprietário retornar, retomar a exportação nativa em uma pasta nova, validar cobertura/hashes e então resolver o ensaio representativo de recuperação. Até lá, a preparação local desta rodada está concluída; não permanecer aguardando senha nem reabrir prompts.



Segurança da próxima conexão: NÃO usar `supabase db query --linked` da CLI 2.122.0 para estas leituras: essa versão inicializa login temporário antes de enviar a consulta. O incidente anterior está registrado em outputs/AVALIACAO-REUSO-SUPABASE-LFL.md desta conversa. A validade/revogação daquele papel permanece não verificada. Usar o inventário nativo somente leitura quando a senha estiver disponível; nenhuma remoção de papel ou alteração remota está autorizada automaticamente.


## Retomada concluída — 18/11/2026: fixture preserva usuários; backup recusado na autenticação

Este registro atualiza os estados anteriores sem apagar o histórico. Não houve implantação, migration remota, criação de usuários remotos, alteração de permissões ou uso dos projetos protegidos.

### Resultado do backup presencial

- Alvo único do procedimento: lflzlcqinarrcgncafol; host db.lflzlcqinarrcgncafol.supabase.co, porta 5432, banco/usuário postgres. Proteções de somente leitura e TLS permanecem ativas.
- A primeira janela não ficou visível ao proprietário. Posteriormente foi aberta uma aba visível do Windows Terminal e o proprietário autorizou uma única nova tentativa.
- Na aba visível, o proprietário informou o erro **password authentication failed**. O pg_dump retornou código 1 e o procedimento interrompeu. Nenhuma tentativa adicional foi feita após essa falha. Nenhuma senha foi capturada, recuperada, registrada ou usada a partir do chat.
- Pacote parcial atual: C:\Users\User\ERP-NEIA-BACKUPS\LFL-NATIVO-20261118-070254-38a1b983. database-full.dump tem zero bytes; RESULT.json registra FAILED_PG_DUMP. Hash de arquivo vazio não torna o backup válido.
- A pasta parcial anterior LFL-NATIVO-20261118-065245-3c7544db e as pastas de 17/11 foram preservadas. Não reaproveitar nenhuma como fonte de recuperação.
- **Backup real, Auth e metadados Storage: PENDENTES. Arquivos Storage: NÃO EXPORTADOS. Restauração de dados reais: NÃO EXECUTADA.** Não foi executado SQL remoto após a autenticação recusada.
- A falha comprova que a autenticação não foi aceita; não autoriza recuperação de credenciais, redefinição de senha, troca automática para pooler ou repetição. O próximo passo depende de o proprietário conferir a senha vigente e autorizar uma nova tentativa presencial, sem enviar a senha ao chat.

### Correção local da fixture

- scripts/homologacao-staging-fixture.sql não exige mais exatamente oito usuários no banco inteiro. Exige oito UUIDs distintos e explícitos, protocolo UUID, referência e autorização específica de escrita para essa mesma referência.
- Cada conta precisa ter e-mail sintético com protocolo, confirmação e marca correspondente em raw_app_meta_data.neia_homologacao, definida por Auth Admin. Não confiar apenas em e-mail ou raw_user_meta_data editável pelo usuário.
- São preservados Auth, profiles e papéis de todos os usuários fora desses oito UUIDs. Removido o DELETE de papéis. Nas contas de teste atestadas, só é permitida a conversão do papel inicial cliente ao papel esperado; combinações inesperadas são recusadas.
- A fixture possui BEGIN/COMMIT próprios: não envolver em --single-transaction. Falha desfaz schema de fixture, papéis, pedidos, motoboys, rotas e vínculos criados pela transação. Reaplicação recusa sobrescrita.
- Os bloqueios de operação preexistente permanecem: pedidos, motoboys, rotas e contas fora dos dois registros DEMO conhecidos impedem a instalação. Não apagar dados para satisfazer esse requisito.
- scripts/homologacao-pg17/staging-usuarios-sinteticos.sql cria somente contas de Auth substituto local; bloqueia host não loopback, usuário diferente do executor e presença de encrypted_password. Nunca usá-lo no Supabase real.
- scripts/homologacao-pg17/fixture-staging.test.ps1 verifica o cluster próprio e usa duas contas legadas sintéticas mais oito novas. scripts/homologacao-pg17/executar.ps1 chama essa suíte com -FixtureStaging.
- O runner continua offline por padrão. --executar exige NEIA_STAGING_ESCRITAS_AUTORIZADAS igual à referência; a autorização de backup/leitura não satisfaz a autorização humana para homologação mutável.

### Testes e limites

- **18/18 verificações da fixture PASSARAM em PostgreSQL 17.11 real, local e descartável**, após aplicar a cadeia revisada até 0123. Cobrem autorização incorreta, UUIDs repetidos, seleção indevida de usuário antigo, marca administrativa ausente, papel inesperado, falha na segunda rota, rollback dos papéis e da primeira rota, instalação válida, preservação de Auth/profiles/papéis antigos e recusa de reaplicação.
- Estado válido contém dez usuários (dois legados sintéticos + oito de teste), duas rotas e nenhuma liberação automática pela Central. O fluxo não chama aceitar_rota.
- Evidência local: work\fixture-latest.log desta conversa; cluster neia-pg17-5d9e4998c1a840b2812a0d80cbae2bcb. Servidor encerrado no finally e ausência de postmaster.pid confirmada. Diretórios anteriores preservados.
- Durante a preparação, corrigidos dois problemas do teste: medição dos legados antes da evolução do Auth substituto e codificação Windows de uma string do gatilho sintético. O cenário final completo passou após as correções.
- Preservados por hashes os resultados anteriores: 23 testes ERP, sete contratos App, 11 verificações de recuperação sintética e oito guardas Storage. Não foram repetidos sem alteração nos arquivos afetados. A correção do schema public da restauração continua preservada.
- Parser PowerShell e git diff --check foram verificados; nenhum build foi repetido, pois não houve alteração de aplicação, layout ou bundle.
- **Auth/PostgREST/RLS hospedados e E2E autenticado continuam NÃO TESTADOS.** Stubs locais não comprovam esses serviços. Caixa e Financeiro ainda compartilham app_role=financeiro; não declarar separação de capacidades apenas porque os UUIDs diferem.

### Contrato atualizado para futura execução autorizada

1. Antes de qualquer escrita remota: backup íntegro, restauração representativa, baseline e delta incremental aprovados. As 69 tabelas antigas e 29 ausentes não se resolvem com replay cego do manifesto. Preservar contenções de grants da M24.
2. Com autorização específica posterior, gerar protocolo UUID e criar oito contas Auth sintéticas novas, preservando todas as existentes. E-mail: neia-qa+<nome>-<protocolo sem hífens>@example.invalid. Nomes: cliente, atendente, producao, caixa, financeiro, responsavel, motoboy-a, motoboy-b.
3. Pelo Auth Admin autorizado, marcar raw_app_meta_data.neia_homologacao com protocolo, staging_ref e conta; conta usa motoboyA/motoboyB para os dois entregadores. Não alterar metadados do usuário antigo.
4. Guardar mapa JSON fixture_atores com exatamente cliente, atendente, producao, caixa, financeiro, responsavel, motoboyA e motoboyB, cada um associado ao UUID retornado pelo Auth. Guardar configuração e senhas fora do Git, com acesso restrito.
5. Somente nessa fase aprovada, fornecer ao psql as variáveis staging_ref, escritas_autorizadas_ref, fixture_protocolo e fixture_atores. Usar -X -v ON_ERROR_STOP=1 -f scripts/homologacao-staging-fixture.sql, SEM --single-transaction. Não executar esses passos agora.
6. Revisar separadamente a ativação de corte_rpc em staging e as permissões Caixa/Financeiro. Validar configuração offline antes de --executar. Não executar gerador de Auth substituto contra Supabase.

### Estado e consolidação

- ERP: branch homologacao-finalizacao, HEAD inicial desta rodada d864af2daa5de97dbaf6900c330eb2c8dc5cc5ea.
- App: branch feat/app-motoboy-integracao-m3-a, HEAD d5b68870f04e9440f5c3ca38f18201c6f06838d6; nenhuma alteração nesta rodada, índice vazio e nove arquivos históricos não rastreados preservados.
- AGENTS.md, três PNGs, supabase/.temp/cli-latest, scripts/commit-seguro.ps1 e demais arquivos históricos ficam fora dos lotes. Nenhum push/deploy.
- Lotes revisáveis: (1) restaurar-backup-local.ps1 e seu teste; (2) runner e teste, fixture, gerador local, executor e novo teste da fixture; (3) estes dois relatórios. A confirmação manual COMMIT do procedimento existente permanece obrigatória; autorização geral não é usada para contorná-la. Registrar abaixo os hashes apenas quando efetivamente criados.

### Próxima ação segura

O proprietário deve conferir a senha vigente do banco do projeto autorizado pelos seus próprios meios e, quando estiver pronto, autorizar **uma nova tentativa** no terminal visível. Não enviar a senha ao chat. Sem essa autorização, não reabrir prompt nem testar autenticação. Após uma exportação íntegra, verificar Storage e dependências pg_cron/supabase_vault antes de chamar a recuperação completa de aprovada. Nenhuma escrita de homologação remota está autorizada nesta rodada.


### Consolidação efetivamente concluída em 18/11/2026

Após revisão seletiva, diff preparado, validações do commit-seguro.ps1 e confirmação COMMIT fornecida pelo proprietário em cada lote, foram criados somente estes commits LOCAIS:

1. c3050ae0af57f0629b5e3f6b4d7c970069f1339a — test(backup): valida restauracao PostgreSQL isolada
   - scripts/homologacao-pg17/restaurar-backup-local.ps1
   - scripts/homologacao-pg17/restaurar-backup-local.test.ps1
2. 12c949e6a96c88a55779744648384aad77258779 — fix(homologacao): exige autorizacao e preserva usuarios existentes
   - scripts/homologar-auth-staging.mjs
   - scripts/homologar-auth-staging.test.mjs
   - scripts/homologacao-staging-fixture.sql
   - scripts/homologacao-pg17/staging-usuarios-sinteticos.sql
   - scripts/homologacao-pg17/executar.ps1
   - scripts/homologacao-pg17/fixture-staging.test.ps1

Estado final conferido: ERP homologacao-finalizacao em 12c949e6a96c88a55779744648384aad77258779, índice vazio, seis arquivos rastreados modificados (AGENTS.md, este HOMOLOGACAO, três PNGs e supabase/.temp/cli-latest) e 277 arquivos não rastreados históricos preservados, incluindo CONTINUACAO e commit-seguro. App permanece em d5b68870f04e9440f5c3ca38f18201c6f06838d6, branch feat/app-motoboy-integracao-m3-a, índice vazio, nenhum rastreado modificado e nove não rastreados históricos.

Os dois relatórios foram atualizados no disco e ficaram fora desses commits de código; seu conteúdo histórico não foi incluído acidentalmente nos lotes. git diff --check e git diff --cached --check passaram. Parser dos dois PowerShell afetados: zero erros. Nenhum segredo, log, backup ou artefato temporário foi incluído nos commits. Nenhum push, deploy ou nova tentativa de autenticação após a falha. Backup real e recuperação real continuam PENDENTES.

Retomada exata: não repetir a homologação local já aprovada. Aguardar o proprietário conferir a senha vigente e autorizar uma nova tentativa de exportação de leitura, uma única vez, no terminal visível. Nenhuma migration nem teste de escrita remota está autorizado. Depois da exportação íntegra, resolver dependências de recuperação, verificar Storage e submeter o delta incremental antes da homologação Auth/PostgREST/RLS.


## Atualização definitiva de backup e delta local — 18/11/2026

**Este estado substitui as notas anteriores de falha de autenticação.** O pacote LFL-NATIVO-20261118-071451-1e866d18 foi exportado com sucesso; 12/12 itens do manifesto passaram na conferência. A cópia E:\NEIA-SALGADOS-BACKUP-LFL-20261118-8e8a0d6a também passou em outro disco físico, com ACL privada. O original permanece intacto. Nenhuma nova autenticação ou operação remota foi necessária nesta rodada.

Recuperação PARCIAL comprovada: 106 tabelas (69 public, 27 Auth, dez Storage), usuário existente preservado, contagens e hashes coincidentes; cron/Vault/Realtime, seis event triggers e 22 memberships gerenciadas ficam fora. Não chamar isso de recuperação integral. Nenhum segredo Vault foi extraído, job executado ou extensão ausente instalada.

Base aditiva local testada: 29 tabelas, 35 colunas, quatro enums novos e constraints pré-requisito, com dez verificações aprovadas, rollback por falha, dados antigos preservados e M24 bloqueada. Em outro laboratório somente sintético, 0105–0123 aplicaram e dez suítes SQL passaram; seis verificações com duas sessões e três casos do guard de cliente passaram. Isso NÃO comprova Auth/PostgREST hospedados ou o checkout completo: ainda faltam 11 assinaturas de entrada/reserva/consumo/frete e revisão do delta antigo.

Plano, lista exata das tabelas, exclusões, dependências comprovadas, rollback, testes e próxima tarefa estão em docs/auditoria/homologacao-lfl-20261118/RESULTADO-E-PLANO.md. Protótipos operacionais e dados ficam fora do Git. Não repetir os ensaios aprovados; continuar pelo recorte 0089–0095/0103 antes de solicitar escrita hospedada. Nenhum push/deploy nem alteração dos projetos protegidos.

### Consolidação do ensaio lfl — commit local confirmado

Commit criado com confirmação manual COMMIT: b684fe985a12b11d108a7f721b048773bb96ea64 — test(homologacao): valida recuperacao parcial e base aditiva lfl.
Arquivos exclusivos: scripts/homologacao-pg17/lfl-base-aditiva-local.sql; scripts/homologacao-pg17/lfl-base-aditiva-local.test.ps1; docs/auditoria/homologacao-lfl-20261118/RESULTADO-E-PLANO.md; docs/HOMOLOGACAO-REAL-ERP-MOTOBOY.md.

ERP homologacao-finalizacao, índice vazio, cinco modificados históricos (AGENTS.md, três PNGs e supabase/.temp/cli-latest) e 277 não rastreados preservados. App feat/app-motoboy-integracao-m3-a em d5b68870f04e9440f5c3ca38f18201c6f06838d6, índice vazio, nenhum rastreado modificado e nove históricos não rastreados. Este CONTINUACAO continua preservado fora do commit. Nenhum backup, segredo, log privado ou protótipo operacional foi incluído.

Backup intacto, 12/12 hashes, cópia independente verificada no disco E:. Recuperação parcial de 106 tabelas comprovada; integral não aprovada. Base aditiva: dez checagens; laboratório sintético: 19 migrations aplicadas, dez suítes SQL, seis verificações de concorrência com duas sessões e três casos de proteção do cliente aprovados. Parser e diff-check aprovados. Typecheck/builds não repetidos por ausência de mudança de aplicativo.

PRÓXIMA TAREFA LOCAL EXATA: concluir os recortes das 11 funções de checkout/reserva/consumo/estorno/frete listadas no relatório, incluindo 0089–0095/0103, rever grants e diferenças dos helpers antigos preservando M24 e executar os testes direcionados. Não repetir os lotes aprovados nem criar outro banco remoto. Protótipos e drivers estão na pasta privada de análise e work desta conversa, conforme o relatório. Nenhum SQL local guardado é autorizado para implantação hospedada.

PRÓXIMA AUTORIZAÇÃO EXTERNA: somente depois de completar e revisar o delta, pedir janela específica no candidato lflzlcqinarrcgncafol, com suspensão reversível do job de lembretes, criação de oito contas/dados fictícios identificados, execução das migrations revisadas e Auth/PostgREST/RLS reais. Preservar o usuário original e não testar sobre os produtos antigos. Essa autorização ainda NÃO foi dada. Produção protegida, push, deploy e cutover continuam proibidos.


## 18/11/2026 — Onze funcoes essenciais e homologacao incremental local concluidas

As onze assinaturas restantes foram implementadas em scripts/homologacao-pg17/lfl-finalizacao-0123, com guarda exclusivamente local. Passaram checkout 50/100, reserva, FEFO, cancelamento parcial, conclusao, frete e estorno pelo ledger; retirada incompleta bloqueia producao. A baixa fisica usa o enum venda e chamada explicita de nove argumentos, sem debito logico duplicado. Consumo novo bloqueia regime controlado desligado. Helpers M24 continuam fechados. Nenhuma migration historica alterada.

Separacao Caixa/Financeiro implementada no servidor por capacidades privadas, vazias por padrao: Caixa confere e recebe; Financeiro paga/estorna/concilia; responsavel distinto aprova. O runner exige capacidades exatas e nega Caixa pagando e Financeiro conferindo sem capacidade. Nenhum funcionario antigo foi inscrito automaticamente.

PASSOU PG17.11: onze funcoes, duas novas suites de funcao/fluxo financeiro, dez suites de regressao, tres casos de isolamento do cliente e 14 verificacoes em sete disputas com duas sessoes reais. PASSOU ensaio da copia privada: hashes das colunas originais das 106 tabelas preservados apos delta; Auth antigo intacto. Fixture local coexistiu com o usuario anterior: oito novos, nove Auth no total, sem alterar o hash anterior. Isso nao comprova Auth/PostgREST reais.

PASSOU ERP: nove testes offline do runner, criacao atomica (203 assercoes existentes), wrappers/integracao, regressoes frete/producao/conciliacao, typecheck e build Vite/Nitro com destino ficticio, Vite sem .env e Nitro em raiz vazia. Scan de 359 arquivos compilados: zero URLs protegidas e zero sb_secret. App: sete contratos passaram; codigo e HEAD d5b68870f04e9440f5c3ca38f18201c6f06838d6 preservados, nenhum commit App necessario. Backup original e copia E: reconferidos, 12/12 hashes cada. Clusters proprios encerrados, arquivos antigos preservados.

Plano unico, assinaturas, testes, arquivos e comandos locais: docs/auditoria/homologacao-lfl-final/PLANO-E-RESULTADOS.md. Esse plano substitui a pendencia anterior de onze funcoes; nao substitui a exigencia de autorizacao remota. Proxima acao externa: aprovar uma janela especifica somente em lflzlcqinarrcgncafol, com preflight/read-only e backup atualizado quando necessario, risco residual da restauracao parcial, pacote hospedado revisado por hash, suspensao reversivel do job identificado, oito contas atestadas/fixture e Auth/PostgREST/RLS. Nao retirar guardas locais nem executar os runners contra a nuvem. Ruio/iqirs permanecem protegidos. Preview e cutover precisam de aprovacoes proprias; nenhum push/deploy nesta rodada.

Resultados privados: final11-result.json, concurrency-final11-result.json e compatibilidade-final11-private.json na pasta privada ja registrada; logs nao entram no Git. Consolidacao do lote depende da confirmacao manual COMMIT; hashes e estado final serao acrescidos depois da operacao, se autorizada.

### Consolidacao final autorizada — 18/11/2026

COMMIT manual recebido do proprietario e repassado ao commit-seguro.ps1, sem contornar a confirmacao. Commit local criado: d9905e7f5acb3f544c162f08248b577d0a100bd3 — feat(homologacao): conclui funcoes essenciais e isola caixa financeiro. Contem 19 arquivos: os 14 da pasta scripts/homologacao-pg17/lfl-finalizacao-0123 (incluindo ORIGEM.json, seis recortes SQL, quatro suites SQL, concorrencia e dois runners), scripts/homologacao-staging-fixture.sql, scripts/homologar-auth-staging.mjs, scripts/homologar-auth-staging.test.mjs, docs/auditoria/homologacao-lfl-final/PLANO-E-RESULTADOS.md e docs/HOMOLOGACAO-REAL-ERP-MOTOBOY.md.

Estado final ERP: homologacao-finalizacao, HEAD d9905e7f5acb3f544c162f08248b577d0a100bd3, indice vazio; somente cinco rastreados historicos modificados (AGENTS.md, os tres PNGs e supabase/.temp/cli-latest); 277 arquivos nao rastreados preservados, incluindo este relatorio e commit-seguro.ps1. Estado final App: feat/app-motoboy-integracao-m3-a, HEAD d5b68870f04e9440f5c3ca38f18201c6f06838d6, zero rastreados modificados, indice vazio, nove nao rastreados historicos. Nao houve commit no App porque nao houve alteracao de codigo.

Verificacoes finais: git diff --check dos dois projetos e diff --cached --check aprovados; fontes e manifesto das onze funcoes conferidos; zero grants de 00-permissoes-novas.sql sobre as 69 tabelas antigas (atinge somente as 29 novas); 12/12 hashes dos backups C: e E: reconferidos; nenhuma escuta nas portas dos clusters proprios 55500/55501. O teste adicional de regime controlado desligado passou sem repetir as suites completas; runner Node final 9/9, App 7/7. Typecheck e build ERP seguros aprovados; App sem codigo afetado, build anterior preservado sem repeticao.

PROXIMA ACAO: obter aprovacao especifica do plano unico em docs/auditoria/homologacao-lfl-final/PLANO-E-RESULTADOS.md. Nenhuma escrita remota esta autorizada. O pacote hospedado definitivo deve primeiro ser condicionado ao schema ATUAL do candidato lflzlcqinarrcgncafol e revisado por hash, preservando M24 e o usuario Auth; nao remover guardas dos arquivos locais para usa-los diretamente online. Confirmar consumidores, backup atualizado e risco residual cron/Vault/Realtime antes de autorizar a janela de migrations, suspensao reversivel do job, oito contas/fixture e Auth/PostgREST/RLS reais. Protegidos ruioyioynwwwiqbjznoa e iqirsunzgavsuhgyjjsi permanecem fora. Nao houve push, deploy, migrations remotas ou pagamentos reais.

## Preparacao controlada posterior ao d9905e7 — somente leitura autorizada

Autorizacao atual: preparar janela e consultar remotamente SOMENTE lflzlcqinarrcgncafol. Nenhuma migration, pausa de job, usuario, teste com escrita, push ou deploy autorizado. Uma unica tentativa PostgreSQL TLS/read-only retornou password authentication failed; interrompida sem repeticao ou SQL remoto concluido. Nao recuperar credenciais nem abrir prompt automaticamente. Supabase foi adicionado, mas ferramentas de consulta ainda nao apareceram nesta conversa; acesso ainda nao comprovado.

Foram fechados docs/auditoria/homologacao-lfl-final/SQL-INCREMENTAL-MANIFESTO.json (26 fontes verificadas contra d9905e7, mais enum contador condicional) e JANELA-CONTROLADA.md. Fontes locais mantem guardas e BEGIN/COMMIT internos; nao sao pacote hospedado pronto. Manifesto SHA-256 8762910c4955e178e5959e485ffcaf38a5909a5b39df02038ed924283abc180d. Nenhuma alteracao de codigo funcional e nenhum teste local aprovado repetido.

Job identificado APENAS NO BACKUP: id 1, agenda 0 12 * * *, ativo; gera pedido_lembretes de 7d/3d/24h/dia. Funcao sem HTTP/Vault/trigger de tabela no snapshot, mas EXECUTE publico/anon/authenticated: pausar cron nao impede invocacao manual. Conferir estado vivo, fuso, consumidores, ACLs e execucoes antes de propor a primeira escrita. Menor proposta futura: alterar somente active, com comparacao de identidade/hash/agenda e retorno ao estado anterior; ainda NAO autorizada.

Recuperacao parcial continua insuficiente para garantir rollback completo de cron/Vault/Realtime e servicos gerenciados. Nao recomendar escrita com uso atual desconhecido. Autorizacoes A job, B delta SQL, C usuarios, D testes, E Preview e F cutover ficam separadas. Proxima tarefa: disponibilizar a conexao Supabase, executar preflight somente leitura, conferir drift e fechar o derivado hospedado por hash, sem remover guardas dos originais nem retestar tudo. Preservados HEAD, indices e arquivos historicos dos dois projetos.


## Leitura hospedada restabelecida — 2026-11-18T13:36:09.154447+00:00

Nova tentativa manual explicitamente autorizada pelo proprietario concluiu em READ ONLY/TLS, PostgreSQL 17.6. Credencial nao registrada e descartada; conexao encerrada. Nenhum SQL remoto de escrita, Auth login, push ou deploy. 69 public, 1 Auth, 31 produtos, 0 pedidos/motoboys/rotas, 1 bucket/3 Storage. MD5 estrutural e0d524146402cf56f9928d77119af765 identico ao snapshot; zero diferencas nos campos de colunas/constraints/funcoes/ACLs capturados. 115 policies com nomes/papeis/comandos/predicados iguais; RLS public habilitada e helpers M24 fechados.

Job 1 ativo, 0 12 * * *, GMT (09h Sao Paulo nesta data), ultimo sucesso 18/11/2026 12:00Z; nenhuma execucao running observada. Ha servicos plataforma e Realtime em pedidos; nenhum consumidor comercial identificado no instante, mas ausencia externa NAO comprovada. Configuracoes locais dos dois repos nao apontam ao candidato. Funcao de lembretes segue invocavel por anon/authenticated: pausar cron nao bloqueia invocacoes manuais.

A view role_table_grants mostra 441 entradas gerenciadas Auth/Storage a menos que o clone superusuario; todas de dashboard_user/supabase_auth_admin/supabase_storage_admin, sem diferenca de public. Nao presumir revogacao: view filtra papeis habilitados; conferir ACLs diretas antes de B. Nao restaurar memberships para compensar visibilidade.

Manifesto atualizado: baseline hospedado confirmado, mas fontes locais nao sao pacote remoto executavel. Novo plano executivo: docs/auditoria/homologacao-lfl-final/PREFLIGHT-HOSPEDADO-E-AUTORIZACAO-A.md. Duas propostas NAO EXECUTADAS: A-PAUSA-JOB-1-PROPOSTA.sql (27d64772c19f1b230527922849edb76cb313e9c0d945477fce6dbec75740e88c) e A-REVERSAO-JOB-1-PROPOSTA.sql (32ce247b280269a106fce1f4fd5ba9b9af809b8e98510dd041e02276fb59058e). A altera apenas active; revalida identidade/estado/proprietario/execucoes/ausencia de pedidos e recusa qualquer mudanca extra. Aguarda autorizacao especifica A. B delta, C usuarios, D testes, E Preview e F producao continuam separados e proibidos. Recuperacao integral continua NAO comprovada. Nao repetir testes locais nem pedir senha novamente para repetir a coleta concluida.


## Preservacao solicitada pelo proprietario — job 1 NAO autorizado para pausa

Decisao atual: nao modificar o Supabase hospedado; job 1 nao foi pausado e permanece no estado ativo observado na ultima leitura. Nao ha leitor local aguardando senha, retry automatico ou acao de homologacao agendada. O job normal remoto continua sua rotina existente; nao foi criada nenhuma nova automacao. Nao abrir terminal nem usar credenciais automaticamente na retomada.

Checkpoint executivo final: docs/auditoria/homologacao-lfl-final/PREFLIGHT-HOSPEDADO-E-AUTORIZACAO-A.md. Manifesto SQL atualizado para PRESERVADO_PAUSA_NAO_AUTORIZADA, com authorizationGranted=false, executed=false e executionScheduled=false. Propostas de pausa/reversao preservadas localmente, com hashes e copias textuais no relatorio; nao homologadas com pg_cron e fora do commit de documentacao.

Proxima execucao: ler o checkpoint, confirmar branch/HEAD/indice e hashes, e aguardar NOVA autorizacao A para a janela. Depois, somente se autorizada, revalidar o job/baseline por leitura antes da alteracao. Sequencia independente: A job; B delta/migrations por hash; C usuarios ficticios; D testes Auth/PostgREST/RLS/E2E com escrita; E Preview; F producao. Nao repetir testes/auditorias aprovados. Nenhuma autorizacao B–F decorre de A. Restauracao integral continua nao comprovada. Consolidacao de tres documentos validados pendente da confirmacao manual COMMIT; SHA e estado final serao registrados apos a operacao.
