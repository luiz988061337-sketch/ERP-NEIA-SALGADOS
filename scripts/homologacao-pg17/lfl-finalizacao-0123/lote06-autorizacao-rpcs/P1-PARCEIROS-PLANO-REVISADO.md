# P1 parceiros — proposta revisada, NAO AUTORIZADA para execucao hospedada

Base documental: snapshot de 18/11 e contrato em src/routes/parceiros.tsx.
Nao representa leitura atual do hospedado. Nenhuma autorizacao remota A-F concedida.
O lote 06 nao altera parceiros no laboratorio; esta revisao e somente documental.

## Problema e contrato correto

- `parceiros read`: SELECT para PUBLIC, USING(true). Expoe candidaturas privadas.
- `parceiros write`: INSERT para PUBLIC, WITH CHECK(true). Permite inserir status de aprovacao.
- `parceiros candidatura`: INSERT para anon/authenticated, exige status='nova', nome entre 1 e 200 caracteres, limites de proposta/descricao.
- `parceiros admin read`: SELECT autorizado por has_role(admin).
- O formulario envia status='nova'; nao substituir por pendente.
- A view parceiros_publicos lista apenas status='aprovado' E autoriza_divulgacao=true,
  projetando os campos de divulgacao, sem email/whatsapp das candidaturas privadas.
- Nao existe uma unica policy chamada parceiros read/write.

## Pre-checks exclusivamente de leitura, antes de uma futura autorizacao

1. Confirmar referencia lflzlcqinarrcgncafol e excluir projetos protegidos.
2. Capturar definicoes exatas, donos, RLS, grants e hash das quatro policies,
   tabela e view; abortar em diferenca nao revisada. Nao capturar valores pessoais.
3. Confirmar uso do formulario e da view; verificar consumidores que leiam a
   tabela diretamente. Conferir que administradores autorizados possuem o papel.
4. Conferir backup original e copia independente. Restauração integral de cron,
   Vault e Realtime continua NAO comprovada; esta mudanca nao toca esses objetos.
5. Conferir grants estruturais separadamente: TRUNCATE ignora RLS. O snapshot
   contem GRANT ALL para anon/authenticated; a troca de policies NAO o corrige.
   Qualquer revogacao estrutural deve ter lista exata e autorizacao especifica,
   sem alterar os grants M24 ou conceder privilegios para compensar erros.

## Menor alteracao proposta — ainda nao executar

Em transacao unica, com lock_timeout curto e precondicoes verificadas:

1. Remover exatamente `parceiros read` e `parceiros write`.
2. Preservar sem reescrever `parceiros candidatura`, `parceiros admin read` e a view.
3. Adicionar/validar escrita administrativa restrita a authenticated com
   has_role(auth.uid(),'admin'), em USING e WITH CHECK, como no lote 05 local.
4. Nao alterar registros, status existentes, Auth, Storage, funcoes, job ou M24.
5. Inspecionar a definicao resultante ainda na transacao; abortar em divergencia.

## Validacao isolada e futura validacao autenticada

- anon e cliente: candidatura nova valida aceita; status aprovado/rejeitado e
  entradas fora dos limites recusados; UPDATE/DELETE de terceiros recusados.
- anon e cliente: tabela privada sem linhas acessiveis; view retorna apenas
  publicacoes aprovadas e consentidas, sem campos privados.
- administrador: leitura e escrita autorizadas; papeis sem autorizacao negados.
- confirmar separadamente a matriz estrutural, sem tentar TRUNCATE no remoto.
- comparar contagens/hashes de dados e definicoes antes/depois: nenhuma linha
  antiga deve ser alterada pelo DDL. Testes que inserem fixtures exigem outra
  autorizacao explicita; SELECT de metadados nao autoriza testes com escrita.

## Impacto e reversao segura

Formulario e lista publica seguem os contratos atuais. Consumidor que dependa
da leitura privada irrestrita pode falhar e deve ser identificado antes da janela.
O DDL pode aguardar locks: usar lock_timeout curto, falhar sem forcar sessoes.
Nao e necessario alterar ou pausar processar_lembretes para preparar este plano.

Antes do COMMIT, qualquer erro causa ROLLBACK da transacao inteira. Depois do
COMMIT, corrigir somente o caminho legitimo afetado, sob nova autorizacao; se
necessario, suspender temporariamente a candidatura em vez de reabrir acesso.
Nao recriar automaticamente policies vulneraveis, nao usar GRANT global e nao
restaurar dados sobre os existentes. Definicoes anteriores ficam como evidencia
de recuperacao, nao como rollback automatico aprovado.

## Ordem de autorizacoes

Primeiro revisar/aprovar artefato P1 e pre-check atual. Autorizar separadamente:
DDL de policies; eventual revogacao estrutural; usuarios sinteticos; testes Auth/
PostgREST/RLS com escrita; Preview; producao/cutover. Este documento nao concede
nenhuma dessas autorizacoes e nao altera o plano A-F do delta operacional.
