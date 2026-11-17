# Homologação integrada do ERP e App Motoboy

## Alvo e custo

Use um projeto Supabase exclusivo, com Auth, banco, Storage e chaves próprios. Compare a referência exibida no Dashboard com o inventário da conta e com os IDs bloqueados por `scripts/proteger-dev.mjs`. O nome `neia-salgados-staging` aparece no inventário, mas pertence à referência que o ERP bloqueia como produção. O segundo projeto visível tem uso não confirmado.

Em 17/11/2026, a tabela oficial do Supabase indicava até dois projetos ativos no plano Free, conforme organização e titularidade. O plano Pro começava em US$ 25/mês, com projeto adicional a partir de US$ 10/mês. Branch Micro começa em US$ 0,01344/h antes de consumo adicional. Conferir a cota real e a estimativa no Dashboard antes da criação. A melhor opção para dados sintéticos é um projeto Free separado, se houver vaga. Referências: [preços Supabase](https://supabase.com/pricing) e [cobrança de branches](https://supabase.com/docs/guides/platform/manage-your-usage/branching).

## Preparar Supabase

1. Confirmar autorização e referência do projeto separado. Usar painel/credencial próprios e identificar o host TLS pelo Dashboard. Evitar vínculo local ao projeto até o alvo ser confirmado. Reservar este banco para homologação e usar somente dados fictícios.
2. Antes de aplicar SQL, confirmar vazio operacional, Auth funcionando e recursos externos desativados. Conferir histórico de migrations, backup de qualquer ambiente reutilizado e dependências de Auth, Storage e Realtime.
3. Para instalação limpa, revisar o manifesto de PostgreSQL 17 como ordem de dependências, incluindo 0123. Executar o SQL real sem o simulador de Auth/Storage local. Em projeto já iniciado, aplicar somente pendências confirmadas por inventário. Parar na primeira divergência. Nunca usar o manifesto como lista automática de pendências produtivas.
4. Criar e confirmar no Auth oito contas distintas com os e-mails `neia-qa+{cliente,atendente,producao,caixa,financeiro,responsavel,motoboy-a,motoboy-b}@example.invalid`. Use senhas temporárias fortes. O esquema usa `financeiro` para Caixa e Financeiro, com pessoas diferentes, e `admin` para Responsável. A fixture verifica e fixa exatamente um papel por usuário.
5. Em uma sessão `psql` com host e TLS de staging verificados, executar `scripts/homologacao-staging-fixture.sql` com `-X --single-transaction -v ON_ERROR_STOP=1 -v staging_ref=REF_CONFIRMADA -f`. O SQL para se encontrar usuários, pedidos, motoboys, rotas ou contas fora do conjunto sintético esperado. As duas contas demonstrativas da 0081 são previstas. Copiar o JSON da fixture e os oito UUIDs para o arquivo privado local de configuração. Não incluir senhas no Git ou na conversa.
6. Após a fixture em banco fictício, habilitar temporariamente `UPDATE neia_operacao.motoboy_config SET corte_rpc = true WHERE id;` na sessão autorizada. O teste real exige esse marcador para validar o cenário exato do corte. O valor inicial criado pela 0122 é `false`.

## Executar Auth, PostgREST e RLS

O arquivo privado fora dos dois repositórios contém `ref`, `chavePublica` (`sb_publishable_` de staging), `fixture` (o JSON retornado pelo SQL) e `contas` (objetos `cliente`, `atendente`, `producao`, `caixa`, `financeiro`, `responsavel`, `motoboyA`, `motoboyB`, cada um com `id`, `email` e `senha`). Use um gerenciador de segredos ou um arquivo local restrito.

```powershell
Set-Location 'C:\Users\User\ERP-NEIA-SALGADOS'
$env:NEIA_STAGING_REF_AUTORIZADA = '<ref confirmada>'
$env:NEIA_STAGING_CONFIG = '<caminho absoluto privado>'
node .\scripts\homologar-auth-staging.mjs
```

A suíte usa a sessão real de cada usuário, verifica papéis e protocolo antes das mutações e recusa redirecionamentos. Testa isolamento de pedidos e rotas, tentativa de reivindicação, retirada, início concorrente, GPS e encerramento, conferência, autoaprovação, aprovação concorrente, permissões de pagamento e ledger. A fixture é consumida pelos testes. Para outra rodada, preparar uma fixture separada em ambiente descartável autorizado. Um erro de rede depois de uma escrita exige consultar o estado e o log antes de repetir. A regressão de rollback forçado fica no PostgreSQL descartável para evitar instalar gatilhos de teste no staging remoto.

## Preview e fluxo integral

Use um Preview Vercel isolado e protegido. A execução do build deve usar `vite build --config vite.staging.config.ts`. Defina, somente no escopo autorizado de Preview, `NEIA_AMBIENTE=staging`, `NEIA_STAGING_REF_AUTORIZADA`, `VITE_SUPABASE_URL`, `SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_PUBLISHABLE_KEY`. Use host oficial `https://REF.supabase.co` e a mesma chave pública de staging. O build recusa Production, URLs divergentes e chave administrativa. O servidor recusa runtime com destino diferente do build. O App usa `MOTOBOY_STAGING_REF_AUTORIZADA`, `MOTOBOY_LOCAL_SUPABASE_URL` e `MOTOBOY_LOCAL_PUBLISHABLE_KEY` no build `vite build --config vite.motoboy-local.config.ts`.

Com o Preview autenticado, percorrer checkout fictício, atendimento, reserva, produção, Central, entrega, retorno, conferência, aprovação, pagamento simulado e Financeiro. Testar retirada, agendamento, cancelamento, falha de rede, repetição e atualização da fila de impressão. Guardar URLs, versão e respostas sem tokens. Validar visualmente desktop e 390 px. Manter webhooks, gateways, mensagens, push produtivo e impressora da loja desconectados durante a rodada. A impressora TANCA exige rodada física supervisionada.

O App atual é web. Validar em Chrome Android e Safari iOS no HTTPS do Preview, com permissão concedida, negada, revogada, aparelho sem sinal, reconexão, bloqueio de tela e encerramento de rota. O GPS desta versão envia em primeiro plano com consentimento. Preparar rastreamento persistente em segundo plano como integração nativa, com autorização de localização e instrumentos próprios de cada plataforma. O projeto Android encontrado é o leitor Pix, separado do App Motoboy. É preciso acesso a aparelhos e, para publicação nativa, ambiente de build e assinaturas Android/iOS.

## Corte e rollback

1. Inventariar migrations do banco alvo, concluir staging e preservar backup verificável de dados e configuração. Ensaiar restauração em uma instância isolada. Registrar versões anterior e candidata.
2. Antes do corte, reconciliar rotas abertas, retiradas antigas, acertos pendentes e pagamentos. Rotas iniciadas antes do vínculo de retirada devem ser concluídas em janela controlada. Não preencher histórico de retirada artificialmente.
3. Aplicar somente migrations pendentes aprovadas, mantendo o interruptor 0122 desligado. Homologar a interface candidata e as RPCs. A Central cria rota pela 0108 e encerra pela nova RPC, o motoboy usa as RPCs de retirada, saída, entrega, retorno, chegada e atraso. Cadastro permanece com a equipe. Aviso interno de retorno sai na mesma transação da RPC.
4. Quando não houver rotas em trânsito e o proprietário autorizar o corte, liberar o frontend candidato, atualizar bundles das equipes e ativar `corte_rpc`. Validar smoke tests antes de reabrir a operação. O bloqueio cobre pedidos e alterações de disponibilidade do motoboy, avisos diretos e vínculos de rota. Separar eventuais contas com papéis de motoboy e equipe.
5. Para rollback, interromper novas operações e avaliar as rotas que já usaram o fluxo novo. Restaurar o frontend anterior e o estado anterior do interruptor em janela autorizada somente após conferir compatibilidade de estados. Preservar ledger e auditoria, sem tentar desfazer pagamento com alteração direta. Uma reversão do banco exige plano incremental e restauração ensaiada.

Autorizações externas pendentes: designar ou criar Supabase isolado e confirmar custo, habilitar modo de teste e usuários sintéticos, criar ou configurar Preview protegido com variáveis próprias, testar dispositivos físicos e serviços externos e aprovar publicação produtiva separadamente. Nenhuma dessas ações está coberta por aprovação visual ou pelo teste PostgreSQL sintético.

## Preservação do projeto existente e migração incremental

O proprietário confirmou em 17/11/2026 que o Supabase atual contém pedidos ou cadastros da empresa. A referência `ruioyioynwwwiqbjznoa`, mesmo com o nome `neia-salgados-staging`, fica reservada à operação existente. As proteções no código continuam obrigatórias. Os testes deste roteiro exigem outra referência e outra base.

### Criar staging somente com estrutura e massa fictícia

Após autorização para criação e confirmação do custo no Dashboard, criar um projeto vazio em organização com cota disponível. Escolher nome distinto, guardar a nova referência e comparar com as referências bloqueadas. Manter chaves, senha de banco e senhas fictícias em armazenamento privado externo ao Git. Criar o schema a partir da cadeia de instalação limpa revisada e das estruturas de Auth/Storage fornecidas pelo próprio Supabase. Usar o manifesto como ordem de dependência e parar no primeiro erro. Não carregar dumps de dados, usuários, pedidos, contas ou arquivos do projeto existente.

Desativar integrações externas de pagamento, mensagens, impressão e webhooks de operação no projeto de teste. Criar oito usuários sintéticos confirmados e aplicar a fixture do roteiro. Validar Auth, PostgREST e RLS com a suíte de API antes de habilitar Preview e percorrer as telas. O marcador de staging é um identificador de teste, sem privilégios administrativos. A criação e aplicação remota ainda precisam de autorização específica sobre a nova referência.

### Backup completo antes de qualquer futura atualização do projeto existente

O backup deve ser uma operação própria autorizada, com origem confirmada, armazenamento privado criptografado e ensaio de recuperação. Nesta execução foram preparados somente os passos abaixo.

1. Inventariar banco, versão PostgreSQL, extensões, histórico de migrations, papéis, policies, funções e triggers. Registrar contagens por tabela e totais financeiros, usando relatórios privados sem dados pessoais na conversa.
2. Verificar a disponibilidade e retenção de backups/PITR no plano real. Para exportação lógica, usar o procedimento oficial vigente para papéis, estrutura e dados. Conferir explicitamente a inclusão de usuários e relações Auth, customizações de schemas gerenciados e histórico `supabase_migrations`. Um export padrão de estrutura da CLI não comprova backup completo.
3. Copiar separadamente os arquivos de Storage, acompanhados de bucket, caminho, tamanho e hash SHA-256. O backup PostgreSQL guarda metadados, mas não os bytes dos objetos. Registrar configuração de Auth, SMTP, OAuth, Realtime, Edge Functions e variáveis em cofre privado, mantendo segredos fora do repositório.
4. Registrar o instante consistente do snapshot. Se houver gravações, combinar snapshot/PITR com a cópia de objetos ou estabelecer janela aprovada para evitar que banco e arquivos representem instantes incompatíveis. Produzir manifesto com hashes dos arquivos e duas cópias protegidas.
5. Restaurar em ambiente de recuperação isolado, sem liberar acesso a clientes ou conectar automações. Conferir schema, constraints, roles, RLS, contagens, totais, relações financeiras, usuários e amostra dos objetos por hash. Testar login e leitura somente no ambiente recuperado. A recuperação só está validada quando o teste conclui e os tempos de restauração estão registrados.
6. Documentar a janela de recuperação e os pagamentos recebidos após o snapshot. Restaurar um backup antigo no projeto ativo pode perder essas gravações. A estratégia deve preservar e reconciliar eventos posteriores antes de uma eventual substituição.

A documentação oficial distingue backup de banco, cópia de objetos e configurações da plataforma. Consultar [Database Backups](https://supabase.com/docs/guides/platform/backups) e [Backup and Restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) antes da execução.

### Atualização futura sem apagar registros

Primeiro levantar o histórico efetivo de migrations do banco existente, com autorização de leitura. Comparar funções, assinaturas, enums, constraints e grants com o código e gerar uma lista de pendências. Não executar o manifesto de instalação limpa sobre o banco da empresa.

Ensaiar as migrations incrementais em restauração isolada e manter o banco da empresa preservado durante o ensaio. Conferir em especial o backfill e ledger da 0106, assinaturas da 0107, atribuição da 0108, restrições da 0109, provas de retirada 0110–0114, acertos 0115–0121 e o interruptor inicialmente desligado da 0122. O índice de acertos ativos da 0119 exige investigação de duplicidades anteriores. Registros históricos sem provas ou datas confiáveis precisam de revisão explícita, preservando as linhas de origem e sem fabricar eventos.

Preferir expansão de schema e adaptações compatíveis. Bloquear a etapa que exigir apagar dados ou inventar histórico e preparar migração corretiva revisável. Aplicar somente arquivos pendentes aprovados, com transação e monitoramento conforme os requisitos de cada arquivo. O corte das interfaces e permissões é coordenado depois de conferir as rotas abertas, acertos e saldos. O backup, o ensaio, a aprovação da lista exata e a autorização final antecedem qualquer alteração produtiva.

O plano de reversão deve identificar quais mudanças aceitam retorno do frontend e quais exigem migration compensatória ou restauração. Ledger e auditoria permanecem rastreáveis. Estornos e ajustes financeiros seguem RPC auditada e autorização operacional. Definir também como reconciliar transações posteriores ao snapshot. Esse procedimento depende do inventário real e não representa autorização para executar SQL no projeto existente.


## Adaptação 0123 — atribuição e liberação pela Central

A 0111 permanece no histórico. A 0123 mantém aceitar_rota apenas como compatibilidade sem escrita: o App novo não oferece aceite. A Central atribui e depois chama liberar_rota_entrega (admin ou producao, nunca motoboy). O App recebe as rotas automaticamente e atualiza a consulta a cada 15 segundos. Confirmar retirada não exige aceite. Iniciar exige todas as provas de retirada e liberação registrada para exatamente os mesmos pedidos e motoboy. O servidor registra autor e horário da liberação e recusa mudanças diretas desses campos. O status inicial permanece preparando.

Instalar 0123 em staging antes das interfaces candidatas. Campos ausentes mantêm o início desabilitado e RPC ausente não gera sucesso artificial. Rotas em preparação anteriores precisam de liberação explícita da Central; não há backfill de aceite/liberação. Rotas já em trânsito preservam os estados e horários existentes. A liberação é idempotente e não pode ser reaproveitada para outra composição. Mudanças de composição após liberação ficam bloqueadas para revisão operacional; não reescrever a prova silenciosamente.

Rodar o manifesto e os testes liberacao-central.sql, liberacao-central-concorrencia.sql e fluxo-completo-rota.sql no PostgreSQL descartável. A suíte remota também exige o bloqueio sem liberação, negação ao motoboy e liberação por Produção. O manifesto de instalação limpa nunca deve ser executado como atualização sobre o banco existente.

GPS: o monitor usa consentimento por rota, encerra após permissão negada e desmontagem/troca de sessão, valida idade, futuro, coordenadas e precisão, não acumula envios e pausa em segundo plano/offline. O servidor continua autorizando cada amostra e ocultando posições após entrega ou expiração. A estratégia Android/iOS permanece web em primeiro plano; versão nativa e rastreamento em segundo plano exigem escolha de arquitetura, assinaturas, permissões do sistema e homologação em dispositivos. Não há aprovação de segundo plano ou aparelhos nesta rodada.
