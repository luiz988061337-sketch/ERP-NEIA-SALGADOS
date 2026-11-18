# Homologação local do candidato lfl — 18/11/2026

**Resultado: backup íntegro, recuperação parcial comprovada e base incremental aditiva testada. Atualização remota e publicação NÃO autorizadas nem prontas.** A recuperação integral, Auth/PostgREST hospedados e o E2E pelo navegador continuam pendentes.

## Backup preservado

- Original intacto: C:\Users\User\ERP-NEIA-BACKUPS\LFL-NATIVO-20261118-071451-1e866d18.
- Os 12 itens do SHA256-final.json passaram por tamanho e SHA-256; o próprio manifesto também foi comparado na cópia. Os três binários Storage estão entre esses itens e passaram pelos hashes.
- Cópia independente verificada: E:\NEIA-SALGADOS-BACKUP-LFL-20261118-8e8a0d6a. C: pertence ao disco físico 0 e E: ao disco 1. ACL da nova pasta restrita ao proprietário/SYSTEM. É outro disco do mesmo computador, não cópia externa/off-site.
- Cópia de trabalho e evidências privadas: C:\Users\User\Documents\Codex\2026-11-16\code-review-guidelines-coordinate-a-private\work\neia-lfl-analise-716a825925394c70b4d4f89b310db682. Nenhum dump, dado Auth, arquivo Storage, chave ou log privado entra no Git. O original foi conferido novamente e permanece 12/12 coincidente.

## Recuperação parcial controlada

Seleção explícita de 1.259 entradas do arquivo; 134 entradas ficam fora do ensaio. Não foi feita omissão automática de um objeto após erro para fabricar aprovação. A lista partial-restore.list e o inventário de exclusões estão na pasta privada acima.

PASSOU: 106 tabelas com contagens e SHA-256 de linhas coincidentes: 69 public, 27 Auth e dez Storage. O usuário Auth existente foi preservado. Foram restaurados 31 objetos de função public, 24 triggers de tabela, 115 policies e 2.679 registros de grants de tabela, com zero índice inválido e zero constraint não validada no resultado parcial. Isso descreve o catálogo recuperado; não comprova serviços Auth/API hospedados.

Exclusões deliberadas: pg_cron e supabase_vault, seus objetos/dados/ACLs; Realtime e publicação; helpers e seis event triggers da plataforma; 22 associações de papéis que dependem do bootstrap GRANTED BY supabase_admin. Definições dos papéis e grants dos objetos selecionados foram preservados. O grafo gerenciado completo não foi reproduzido. Nenhum segredo do Vault foi extraído ou descriptografado.

O dump registra um job ativo: public.processar_lembretes. Sua inspeção em memória não encontrou chamada HTTP ou referência Vault; nenhum comando do job foi gravado no relatório ou executado. Não há referência direta a cron/Vault nas funções public exportadas. Isso não prova ausência de consumidores externos. O estado hospedado não foi reconsultado.

Não houve instalação de binários/extensões ausentes. A recuperação usou apenas os módulos nativos já disponíveis requeridos pela seleção (pgcrypto, uuid-ossp e pg_stat_statements), sem carregar cron ou um agendador. Acesso ao banco de teste restrito a 127.0.0.1; clusters próprios encerrados e diretórios preservados.

**Recuperação integral NÃO APROVADA.** Vault depende da chave original externa ao dump para recuperação de segredos. Não copiar essa chave ou os segredos nesta etapa. Auth, API, Storage como serviço, Realtime, funções externas e configurações do projeto não são comprovados por PostgreSQL puro. Referências técnicas: [Vault](https://supabase.com/docs/guides/database/vault), [pg_restore PostgreSQL 17](https://www.postgresql.org/docs/17/app-pgrestore.html).

## Delta estrutural aditivo

Referência criada em outro cluster vazio, a partir dos 113 arquivos do manifesto revisado até 0123. Comparação concreta: 69 tabelas antigas versus 98 esperadas; nenhuma tabela antiga precisa ser removida.

Tabelas ausentes (29):

- acertos_motoboy
- acertos_rota
- acertos_rota_eventos
- caixa_sessoes
- centros_custo
- config_entrega
- conta_pagamento_eventos
- contador_acessos
- contas
- contas_bancarias
- escalas
- estoque_mov_operacoes
- extratos
- fechamentos_mensais
- funcionarios
- notificacoes_log
- pedido_item_componentes
- pedido_pagamento_eventos
- plano_contas
- pontos
- precificacao_config
- preco_historico
- reserva_consumos
- reserva_proveniencia
- reserva_proveniencia_config
- solicitacoes_contador
- turnos_motoboy
- turnos_motoboy_eventos
- vales

Também foram identificadas 35 colunas ausentes (produtos 1, enderecos 7, pedidos 21, rotas_entrega 4, estoque_movimentacoes 1, categorias 1), quatro tipos enum novos e 12 constraints pré-requisito em tabelas existentes. A chave composta reservas_estoque_prov_uk precisa preceder as referências de proveniência. O CHECK NOT VALID do turno foi validado somente na tabela nova/vazia, sem revalidar históricos reais.

Arquivos preparados:

- scripts/homologacao-pg17/lfl-base-aditiva-local.sql: proposta exclusivamente local, fora de drizzle/migrations. Exige loopback, banco lfl_partial, usuário temporário do ensaio, marcador explícito e assinatura estrutural antiga. Abre transação e deixa COMMIT/ROLLBACK para o executor. Não instala RPCs, não carrega seeds, não muda defaults antigos nem ativa corte_rpc. Novas tabelas ficam com RLS habilitada e sem acesso de anon/authenticated/service_role.
- scripts/homologacao-pg17/lfl-base-aditiva-local.test.ps1: harness do cluster verificado, usando os fingerprints privados produzidos pelo procedimento. Não executar isoladamente contra bancos existentes; recebe Cluster, State, OriginalFingerprints e SqlPath, com Invoke-NeiaLocalPg já importado.

**10/10 verificações PASSARAM:** recusa sem marcador, aplicação seguida de rollback, erro intermediário com rollback total, criação de 29 tabelas sem recriar as antigas, preservação de dados das 106 tabelas nas colunas anteriores, RLS das novas tabelas, bloqueio dos três papéis da aplicação, preservação dos dois grants M24 contidos, índices/constraints válidos e recusa segura de reaplicação. Acrescentar colunas não foi tratado como migração de valores históricos ou invenção de parcelas.

## Ensaio operacional separado, exclusivamente sintético

Outro cluster recebeu SOMENTE o esquema antigo: nenhum dado real de public/Auth/Storage foi importado. Nele foram ensaiados a base aditiva, o rótulo contador do enum, dependências selecionadas da 0084, correção mínima do guard e as 19 migrations 0105–0123. Isso não significa que as 19 já possam ser aplicadas no projeto antigo.

Foram necessárias dependências concretas, sem replay histórico: 12 funções e quatro triggers da referência 0084. A matriz de 15 transições foi carregada apenas no laboratório vazio; o backup original já contém 15 linhas nessa tabela. Para implantação, preservar e comparar a configuração existente, sem tratá-la como ausente por causa da fixture.

Defeito confirmado no guard antigo: quatro IS NOT DISTINCT em campos imutáveis impedem atualizações legítimas do motoboy. O protótipo local corrige somente essas comparações, mantém a allowlist antiga do cliente e adiciona comparação integral das demais colunas para proteger campos novos. Foi necessária uma policy adicional para o cancelamento próprio: a antiga USING era reutilizada como WITH CHECK e recusava o estado cancelado. O novo protótipo permite apenas próprio pedido recebido → cancelado, com o guard impedindo alterações concomitantes. **Três casos passaram:** alteração de total negada, alteração de coluna nova negada e cancelamento legítimo aceito. Nada disso foi aplicado remotamente.

As permissões de tabelas novas foram ensaiadas separadamente da base fechada: 45 policies e grants mínimos de CRUD extraídos da referência. Não foram copiados TRUNCATE/TRIGGER/REFERENCES para usuários da aplicação nem reabertos os helpers M24. Não houve alteração de policies antigas, exceto a nova proposta local de cancelamento descrita acima.

Ownership foi alinhado a postgres somente no laboratório, para representar o papel de implantação em vez do usuário temporário que criou o cluster. Fixtures passaram a pertencer a esse papel. Somente duas associações locais sem herança automática (authenticated/anon para SET ROLE por postgres) foram reconstruídas. Não equivale ao bootstrap Supabase nem aprova RLS hospedado.

**19/19 migrations aplicaram no laboratório. Dez suítes SQL passaram:**

- regressoes.sql
- rotas-app.sql
- inicio-rota-integridade.sql
- impressao.sql
- fechamento-turno.sql
- seguranca-financeira-motoboy.sql
- pagamento-turno.sql
- liberacao-central.sql
- fluxo-completo-rota.sql
- motoboy-corte-gps.sql

**Concorrência real: seis verificações com duas sessões PostgreSQL**, observando o lock da segunda sessão e o resultado final: pagamento repetido gerou um único evento e saldo parcial; baixa repetida consumiu uma vez; dois operadores não atribuíram o pedido a duas rotas nem deixaram rota órfã. Sem dblink ou instalação adicional. Rollback de lote/liberação foi exercitado pelas suítes existentes. Não repetir a afirmação de concorrência para cenários que não foram reexecutados: aprovação/pagamento de turno e início/liberação simultâneos das suítes dblink anteriores não foram revalidados neste delta.

O teste GPS dependia de casos preparados pela suíte dblink. No laboratório sem essa extensão, os casos foram preparados pelas RPCs confirmar_retirada/iniciar_rota, com retiradas completas e liberação válida, sem aceite manual ou atualização artificial de status. GPS SQL passou; aparelho físico, consentimento no navegador, segundo plano e autenticação real continuam fora dessa comprovação.

## O que ainda impede atualização e publicação

1. O delta operacional não está completo. Mesmo após esse lote, ainda faltam estas 11 assinaturas da referência:

- criar_pedido_com_reserva(p_id uuid, p_canal text, p_dados jsonb, p_itens jsonb)
- cancelar_pedido_atomico(p_pedido_id uuid, p_motivo text)
- estornar_conta(p_conta_id uuid, p_motivo text)
- pedido_cobertura_reserva(p_pedido_id uuid)
- reservar_pedido_atomico(p_pedido_id uuid)
- liberar_pedido_atomico(p_pedido_id uuid)
- registrar_consumo_reserva(p_reserva_id uuid, p_quantidade integer, p_idem_key uuid, p_produto_id uuid, p_observacao text)
- exigir_reserva_producao()
- exigir_consumo_producao()
- proteger_consistencia_financeira_pedido()
- distancia_linha_reta_km(p_lat1 double precision, p_lng1 double precision, p_lat2 double precision, p_lng2 double precision)

Isso inclui entrada do checkout com reserva, cancelamento transacional, reserva/consumo e a distância usada pelo frete por km. O teste SQL de fluxo de rota cria pedidos sintéticos diretamente: NÃO é E2E cliente/checkout/FEFO. Não declarar esses fluxos aprovados no esquema antigo. Próxima tarefa local exata: preparar recortes de 0089–0095/0103 e dependências, preservar ACLs M24 e testar checkout/reserva/FEFO/frete no laboratório. Não ativar flags de proveniência ou frete sem configuração e revisão.

2. Permanece diferença do default de pix_notification_events.status: PENDING no antigo e PENDENTE na referência. Não foi alterado automaticamente; verificar contratos dos dois caminhos de integração antes de decidir. O papel contador foi acrescentado somente no laboratório; um enum acrescentado exige etapa de implantação própria e não possui down migration trivial.
3. Revisar as diferenças relevantes das funções antigas, grants legados e metadados de instalação. Não gerar CREATE OR REPLACE/GRANT indiscriminadamente a partir do catálogo. Instalar só as quatro últimas migrations é insuficiente; replay completo das 113 também é inadequado.
4. Auth/PostgREST/RLS reais ainda não foram executados. Caixa e Financeiro compartilham o papel financeiro na fixture; UUIDs diferentes não comprovam separação dessas capacidades. Decisão/contrato de autorização ainda precisam de revisão antes de declarar homologação de papéis concluída.
5. Cron/Vault/Realtime e o grafo gerenciado de roles não foram recuperados integralmente. A ativação eventual do job e das integrações precisa de avaliação e autorização próprias. Nenhuma tarefa agendada foi executada no ensaio.
6. Preview autenticado, impressão física, gateways em modo de teste autorizado e aparelhos precisam de validação. Sem isso, não há versão publicada ou operacional comprovada. WhatsApp automático, GPS em segundo plano e pacotes nativos podem ser adiados somente se o escopo inicial aceito não depender deles; não adiar checkout, estoque, financeiro ou controle de acesso.

## Sequência para homologação real e rollback

1. Concluir o recorte local restante e ensaiar a configuração, grants/RLS e E2E de checkout/reserva/frete. Preservar M24 e os dados originais. Revisar o pacote de execução definitivo; os arquivos locais guardados NÃO são comandos de implantação remota.
2. Antes de qualquer escrita hospedada, obter autorização específica para lflzlcqinarrcgncafol e uma janela de homologação. Reconfirmar identidade, baseline e consumidores ativos por leitura. A referência protegida ruioyioynwwwiqbjznoa e iqirsunzgavsuhgyjjsi ficam fora. Não utilizar o .env produtivo.
3. A autorização deverá individualizar: suspensão reversível do job de lembretes no candidato durante o ensaio; delta final revisado; oito usuários e produtos/pedidos fictícios por protocolo; alteração de papéis só dessas contas novas; fixtures e testes com escrita; ativação de corte_rpc somente no ambiente homologador. Não executar nenhum desses passos nesta rodada.
4. Não apagar o usuário Auth existente, produtos, Storage ou histórico. Usar a fixture já corrigida por UUID/protocolo/raw_app_meta_data, nunca contagem global de oito usuários nem INSERT manual de usuários em Auth hospedado. Não testar estoque/pagamentos sobre os 31 produtos antigos.
5. Validar --validar-config sem rede primeiro. Depois da autorização específica, --executar exige NEIA_STAGING_ESCRITAS_AUTORIZADAS igual à referência, mantendo todos os guardas. Testar oito atores, motoboys distintos, negações, repetição e falha parcial via API real. Nenhum pagamento ou mensagem real.
6. Só então preparar Preview protegido dos dois sistemas apontando exclusivamente ao candidato; sem deploy nesta execução. Percorrer cliente → atendimento → reserva/consumo → cozinha → Central → App → entrega/retorno → conferência → aprovação distinta → confirmação pelo Financeiro. Testar retirada, agendamento, cancelamento, falha de rede e duplicidade.
7. Rollback comprovado da base ANTES do commit é transacional. Após gravações, não usar DROP/limpeza como rollback: interromper novas operações, manter ledger/eventos, avaliar frontend/flags compatíveis e elaborar compensação incremental ou restauração autorizada. A cópia de disco E: não elimina a limitação de Vault e serviços externos. Não restaurar um dump sobre o projeto protegido nem confundir staging com cutover produtivo.

## Evidências e preservação

Evidências privadas principais: partial-result.json, partial-table-hashes-private.json, incremental-base-result.json, concurrency-delta-result.json, rpc-compat-result.json, partial-plan-private.json e os logs dentro da pasta de análise. Drivers locais em work desta conversa: ensaiar-parcial-lfl.ps1, validar-incremental-local.ps1 e provar-rpcs-incrementais.ps1; usam somente clusters novos e credenciais locais efêmeras, nunca a senha Supabase. Preservar esses diretórios. Os protótipos operacionais guard-pedido-local.sql, operational-dependencies-local.sql e new-table-permissions-local.sql permanecem privados e fora do Git até revisão específica do lote seguinte.

ERP: homologacao-finalizacao, HEAD inicial 12c949e6a96c88a55779744648384aad77258779. App: feat/app-motoboy-integracao-m3-a, d5b68870f04e9440f5c3ca38f18201c6f06838d6, sem alteração. AGENTS.md, três PNGs, supabase/.temp/cli-latest, commit-seguro.ps1 e históricos preservados. Não houve alteração de layout, .env, Supabase remoto, push ou deploy. Não foram repetidos typecheck/builds já aprovados: nesta rodada não houve alteração de aplicação, dependências ou bundle. Parser PowerShell e diff-check serão registrados na consolidação.

Consolidação técnica: parser PowerShell sem erros, scan dos quatro arquivos sem padrões de segredos e git diff --check dos dois projetos aprovados. A verificação final de concorrência confirmou explicitamente status pendente após pagamento parcial, seis checagens aprovadas; os demais testes não foram repetidos nessa checagem. O índice estava vazio antes da preparação seletiva. Commits somente com a confirmação manual COMMIT do procedimento existente.
