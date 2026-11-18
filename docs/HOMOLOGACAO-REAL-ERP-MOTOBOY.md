# Homologação integrada do ERP e App Motoboy

## Alvo e custo

Use um projeto Supabase exclusivo, com Auth, banco, Storage e chaves próprios. Compare a referência exibida no Dashboard com o inventário da conta e com os IDs bloqueados por `scripts/proteger-dev.mjs`. O nome `neia-salgados-staging` aparece no inventário, mas pertence à referência que o ERP bloqueia como produção. O segundo projeto visível tem uso não confirmado.

Em 17/11/2026, a tabela oficial do Supabase indicava até dois projetos ativos no plano Free, conforme organização e titularidade. O plano Pro começava em US$ 25/mês, com projeto adicional a partir de US$ 10/mês. Branch Micro começa em US$ 0,01344/h antes de consumo adicional. Conferir a cota real e a estimativa no Dashboard antes da criação. A melhor opção para dados sintéticos é um projeto Free separado, se houver vaga. Referências: [preços Supabase](https://supabase.com/pricing) e [cobrança de branches](https://supabase.com/docs/guides/platform/manage-your-usage/branching).

## Preparar Supabase

1. Confirmar autorização e referência do projeto separado. Usar painel/credencial próprios e identificar o host TLS pelo Dashboard. Evitar vínculo local ao projeto até o alvo ser confirmado. Reservar este banco para homologação e usar somente dados fictícios.
2. Antes de aplicar SQL, confirmar vazio operacional, Auth funcionando e recursos externos desativados. Conferir histórico de migrations, backup de qualquer ambiente reutilizado e dependências de Auth, Storage e Realtime.
3. Para instalação limpa, revisar o manifesto de PostgreSQL 17 como ordem de dependências, incluindo 0123. Executar o SQL real sem o simulador de Auth/Storage local. Em projeto já iniciado, aplicar somente pendências confirmadas por inventário. Parar na primeira divergência. Nunca usar o manifesto como lista automática de pendências produtivas.
4. Somente após autorização específica de escrita, criar oito contas sintéticas novas pelo Auth Admin, preservando todas as contas existentes. Usar e-mails neia-qa+<nome>-<protocolo UUID sem hífens>@example.invalid, com nomes cliente, atendente, producao, caixa, financeiro, responsavel, motoboy-a e motoboy-b. Guardar os UUIDs retornados e marcar raw_app_meta_data.neia_homologacao com protocolo, staging_ref e conta (motoboyA/motoboyB para os entregadores). Não usar metadados editáveis pelo usuário como prova. Caixa e Financeiro compartilham o papel financeiro; revisar a separação de capacidades antes de aprovar esses papéis.
5. Depois de backup/restauração, delta e autorização aprovados, usar a fixture com -X -v ON_ERROR_STOP=1 e as quatro variáveis staging_ref, escritas_autorizadas_ref, fixture_protocolo e fixture_atores (mapa JSON dos oito UUIDs). Ela tem BEGIN/COMMIT próprios: NÃO usar --single-transaction. A seleção exige UUID/protocolo/e-mail/marca administrativa e preserva outros usuários. Pedidos, motoboys, rotas e contas operacionais preexistentes continuam bloqueando a fixture; não apagar dados para satisfazê-la. Copiar o resultado para configuração privada fora do Git.
6. Após a fixture em banco fictício, habilitar temporariamente `UPDATE neia_operacao.motoboy_config SET corte_rpc = true WHERE id;` na sessão autorizada. O teste real exige esse marcador para validar o cenário exato do corte. O valor inicial criado pela 0122 é `false`.

## Executar Auth, PostgREST e RLS

O arquivo privado fora dos dois repositórios contém `ref`, `chavePublica` (`sb_publishable_` de staging), `fixture` (o JSON retornado pelo SQL) e `contas` (objetos `cliente`, `atendente`, `producao`, `caixa`, `financeiro`, `responsavel`, `motoboyA`, `motoboyB`, cada um com `id`, `email` e `senha`). Use um gerenciador de segredos ou um arquivo local restrito.

```powershell
Set-Location 'C:\Users\User\ERP-NEIA-SALGADOS'
$env:NEIA_STAGING_REF_AUTORIZADA = '<ref confirmada>'
$env:NEIA_STAGING_CONFIG = '<caminho absoluto privado>'
node .\scripts\homologar-auth-staging.mjs --validar-config
```

O comando acima é offline. A execução com sessões reais só pode começar após autorização específica de escrita, com --executar e NEIA_STAGING_ESCRITAS_AUTORIZADAS igual à referência. A suíte usa a sessão real de cada usuário, verifica papéis e protocolo antes das mutações e recusa redirecionamentos. Testa isolamento de pedidos e rotas, tentativa de reivindicação, retirada, início concorrente, GPS e encerramento, conferência, autoaprovação, aprovação concorrente, permissões de pagamento e ledger. A fixture é consumida pelos testes. Para outra rodada, preparar uma fixture separada em ambiente descartável autorizado. Um erro de rede depois de uma escrita exige consultar o estado e o log antes de repetir. A regressão de rollback forçado fica no PostgreSQL descartável para evitar instalar gatilhos de teste no staging remoto.

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


## Supabase local sem nuvem — bloqueio confirmado em 17/11/2026

A preparação local foi iniciada fora dos repositórios em C:\Users\User\Documents\Codex\2026-11-16\code-review-guidelines-coordinate-a-private\work\neia-supabase-local-3895d451. O esqueleto possui project_id independente, portas 55471–55474, PostgreSQL major 17, seeds/migrations automáticos desativados e manifesto de origem com 113 arquivos até 0123. Nenhum banco Supabase ou usuário Auth foi criado.

Docker Desktop abriu, mas o motor Linux permanece indisponível: VirtualizationFirmwareEnabled=false, HypervisorPresent=false e erro Wsl/Service/RegisterDistro/CreateVm/HCS/HCS_E_HYPERV_NOT_INSTALLED / No virtualization available. A consulta dos recursos opcionais Windows exigiu elevação; não foram alterados. Podman não está instalado. O runtime nativo oficial não suporta Windows diretamente. Não instalar ferramentas nem alterar BIOS/recursos automaticamente.

O proprietário deve habilitar SVM/AMD-V no firmware e autorizar a verificação administrativa de Virtual Machine Platform/WSL, com habilitação somente se necessária e reinício combinado. Após daemon Linux saudável, manter a rede local limitada a 127.0.0.1 e validar todos os bindings. Não usar a configuração supabase/config.toml do ERP ou vincular projetos remotos.

O runner homologar-auth-staging.mjs e vite.staging.config.ts atuais são restritos ao staging HTTPS na nuvem. A homologação local precisa de modo/configuração próprios e testes para loopback, sem enfraquecer as proteções de produção. Criar os oito usuários via Auth Admin real local, não por stubs; aplicar schema/fixture somente depois da confirmação do cluster descartável. Auth/PostgREST/RLS locais e E2E continuam NÃO TESTADOS. Procedimento completo e diagnóstico constam da seção mais recente de docs/CONTINUACAO-ERP-NEIA.md.

Nenhum projeto hospedado foi acessado nesta rodada. O PostgreSQL nativo pode continuar validando SQL gratuitamente, mas não comprova Auth/PostgREST/RLS. HTTPS/Vercel, serviços externos, aparelhos e publicação produtiva continuam exigindo homologação representativa e autorizações próprias.


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


## Backup real do projeto antigo concluído — 18/11/2026

**Autenticação: CONFIRMADA.** A senha foi digitada pelo proprietário no prompt nativo do PostgreSQL (`-W`), em janela PowerShell própria e visível. Nenhuma senha passou pelo chat, por arquivos, argumentos, histórico, relatórios ou cofre do Windows. Nenhuma conexão foi feita aos projetos protegidos `ruioyioynwwwiqbjznoa` ou `iqirsunzgavsuhgyjjsi`.

### Diagnóstico das tentativas anteriores

- 17/11/2026: senha proveniente do ambiente recusada com `FATAL: password authentication failed for user "postgres"`.
- 18/11/2026 06:52 e 07:02: `FAILED_PG_DUMP` com dump de 0 byte. A execução das 07:02 rodou em aba de Windows Terminal cujo prompt nativo não recebeu digitação; o `pg_dump` terminou com código 1 sem autenticar. `pwsh` não está no PATH desta máquina e a pasta `WindowsApps` não permite listagem, portanto só o caminho literal do runtime empacotado executa.
- 18/11/2026 07:14: `pg_dump` e `psql` autenticaram; dump completo e inventário foram gerados. Apenas o terceiro cliente (`pg_dumpall`) recebeu senha divergente na terceira digitação oculta.
- 18/11/2026 07:23: retomada pontual exportou os papéis com uma única digitação correta.

### Pacote aprovado para leitura

`C:\Users\User\ERP-NEIA-BACKUPS\LFL-NATIVO-20261118-071451-1e866d18` — 12 arquivos, 3.375.572 bytes, ACL restrita ao usuário atual e SYSTEM, herança bloqueada.

| Arquivo | Bytes | SHA-256 (início) |
|---|---|---|
| `database-full.dump` | 751.734 | `2BC42BB6FF227BAE` |
| `roles-no-passwords.sql` | 6.173 | `8F7B3B5F4B9CFA3F` |
| `inventory-private.json` | 52.258 | `211E4FBB0E987F06` |
| `database-contents.txt` | 104.586 | `35B54648C080BACB` |
| `storage-manifest-private.json` | 1.526 | `0E233F52FEA46F3C` |
| 3 objetos do bucket `hero` | 2.455.829 | hashes individuais no manifesto |

`SHA256-initial.json` registra o pacote verificável pelo ensaio; `SHA256-final.json` cobre todos os arquivos. `RETOMADA-PAPEIS.json` documenta a exportação de papéis fora do fluxo principal.

### Cobertura efetiva do dump

- 1.400 entradas no índice; origem PostgreSQL 17.6, cliente 17.11; TLS `verify-full` validado; sessão `default_transaction_read_only=on`.
- Tabelas com dados: `public` 69, `auth` 27, `storage` 10, `realtime` 2, `cron` 2, `vault` 1 — igual ao inventário por schema (`realtime.subscription` é view, por isso 2 de 3).
- 115 policies, 258 constraints, 34 entradas de trigger (inclui event triggers e schemas de plataforma), 227 funções em todos os schemas (59 em `public`/`auth`/`storage`, mesma base do inventário).
- `auth.users` = 1 usuário; 3 objetos de Storage no bucket público `hero`.
- Extensões presentes: `pg_cron 1.6.4`, `supabase_vault 0.3.1`, `pgcrypto`, `uuid-ossp`, `pg_stat_statements`.

### Storage

3 de 3 objetos exportados separadamente, todos do bucket público `hero`, com tamanho idêntico ao snapshot e **ETag HTTP idêntico ao registrado no inventário**. O `snapshotEtagMatches` do exportador fica nulo porque os eTags são multipart (não são MD5 simples); a conferência foi feita por ETag contra ETag e por tamanho, não por MD5. Não existe bucket privado no inventário.

### Restauração local

**RECUSADA antes de criar qualquer cluster:** `Extensao sem suporte no ensaio nativo: pg_cron`. Nenhum cluster foi criado, nenhum dado foi escrito e nenhum resíduo ficou na pasta de ensaio. O bloqueio é real e já previsto: o PostgreSQL 17.11 nativo instalado não possui `pg_cron` nem `supabase_vault`; não foram instalados, omitidos ou substituídos por stubs.

Consequência: **a recuperação integral NÃO está aprovada**. Um dump com essas extensões não pode ser restaurado integralmente neste ambiente.

### Componentes não recuperados neste ambiente

- `pg_cron`: 2 tabelas de dados e o agendamento dos jobs.
- `supabase_vault`: `vault.secrets` e a chave de criptografia da plataforma.
- Serviços Auth (GoTrue), Storage, Realtime e PostgREST como serviços: o dump traz apenas as tabelas.
- Configuração da plataforma: SMTP/OAuth, chaves, variáveis, edge functions e tarefas externas.
- Papéis com senha: não exportados por desenho (`--no-role-passwords`).

### Estado e preservação

- Nenhuma migration, escrita, alteração de RLS, permissão, push, deploy ou instalação nesta rodada.
- Pacotes parciais anteriores preservados e não aprovados: `LFL-NATIVO-20261117-205843-0ea38ab5`, `LFL-NATIVO-20261118-065245-3c7544db`, `LFL-NATIVO-20261118-070254-38a1b983`.
- ERP: branch `homologacao-finalizacao`, HEAD `12c949e6a96c88a55779744648384aad77258779`. Nada foi commitado nesta rodada.

### O que ainda falta para a homologação real

1. Decidir a cobertura de `pg_cron`/`supabase_vault` — cluster com essas extensões, ou aceitar formalmente recuperação parcial documentada. Qualquer instalação exige autorização própria.
2. Aprovar o delta incremental até 0123 no banco antigo (69 tabelas atuais, 29 ausentes na cadeia revisada), preservando as contenções de grants da M24.
3. Adaptar a fixture ao legado (mínimo nove usuários), resolver a separação Caixa/Financeiro e preparar a configuração privada antes de `--executar`.
4. Executar E2E, Preview, GPS e validação em aparelhos — fases que continuam sem autorização.


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
