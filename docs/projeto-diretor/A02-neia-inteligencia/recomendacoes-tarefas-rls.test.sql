-- A02.1.2 — Permissões e comportamento das recomendações e da gestão de tarefas.
-- Execute somente em homologação ou banco descartável. Todos os dados deste teste são revertidos.
-- Este arquivo é executado por `supabase db query --linked -f` no projeto de homologação.

begin;

insert into auth.users (id, email)
values
  ('2b9a0101-761a-4bfa-aaef-0060ab2ed701', 'a02-admin-test@invalid.example'),
  ('2b9a0102-761a-4bfa-aaef-0060ab2ed702', 'a02-equipe-test@invalid.example'),
  ('2b9a0103-761a-4bfa-aaef-0060ab2ed703', 'a02-outra-test@invalid.example'),
  ('2b9a0104-761a-4bfa-aaef-0060ab2ed704', 'a02-cliente-test@invalid.example');

insert into public.user_roles (user_id, role)
values
  ('2b9a0101-761a-4bfa-aaef-0060ab2ed701', 'admin'),
  ('2b9a0102-761a-4bfa-aaef-0060ab2ed702', 'producao'),
  ('2b9a0103-761a-4bfa-aaef-0060ab2ed703', 'atendente'),
  ('2b9a0104-761a-4bfa-aaef-0060ab2ed704', 'cliente')
on conflict do nothing;

-- 1) Anônimo não lê nada da etapa.
set local role anon;
do $$
begin
  perform 1 from public.a02_recomendacoes;
  raise exception 'O papel anon conseguiu ler recomendações';
exception when insufficient_privilege then null;
end $$;
do $$
begin
  perform 1 from public.a02_recomendacoes_historico;
  raise exception 'O papel anon conseguiu ler o histórico das recomendações';
exception when insufficient_privilege then null;
end $$;
reset role;

-- 2) Recomendações: somente o administrador lê, registra e gerencia as situações.
set local role authenticated;
do $$
declare
  v_admin constant uuid := '2b9a0101-761a-4bfa-aaef-0060ab2ed701';
  v_equipe constant uuid := '2b9a0102-761a-4bfa-aaef-0060ab2ed702';
  v_cliente constant uuid := '2b9a0104-761a-4bfa-aaef-0060ab2ed704';
  v_estado uuid;
  v_evento text;
  v_afetadas integer;
begin
  perform set_config('request.jwt.claim.sub', v_equipe::text, true);
  if exists (select 1 from public.a02_recomendacoes) then
    raise exception 'Equipe sem ADMIN leu recomendações';
  end if;
  begin
    insert into public.a02_recomendacoes (recomendacao_id, chave, titulo, prioridade)
    values ('estoque-revisar', 'estoque-revisar', 'Revisar estoque', 'alta');
    raise exception 'Equipe sem ADMIN criou recomendação';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.a02_recomendacoes set situacao = 'ciente';
    get diagnostics v_afetadas = row_count;
    if v_afetadas <> 0 then
      raise exception 'Equipe sem ADMIN alterou recomendação';
    end if;
  end;

  perform set_config('request.jwt.claim.sub', v_cliente::text, true);
  if exists (select 1 from public.a02_recomendacoes) then
    raise exception 'Cliente leu recomendações administrativas';
  end if;

  -- 3) Administrador registra, ciência, adia, dispensa, resolve e reabre.
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  insert into public.a02_recomendacoes (recomendacao_id, chave, titulo, prioridade)
  values ('estoque-revisar', 'estoque-revisar', 'Revisar estoque', 'alta')
  returning id into v_estado;

  if not exists (select 1 from public.a02_recomendacoes_historico
    where estado_id = v_estado and acao = 'detectada') then
    raise exception 'Detecção não ficou no histórico';
  end if;

  update public.a02_recomendacoes set situacao = 'ciente' where id = v_estado;
  if not exists (select 1 from public.a02_recomendacoes
    where id = v_estado and situacao = 'ciente' and ciente_por = v_admin and ciente_em is not null) then
    raise exception 'Ciência não registrou responsável e data';
  end if;

  update public.a02_recomendacoes
    set situacao = 'adiada', adiada_ate = clock_timestamp() + interval '1 hour'
    where id = v_estado;
  if not exists (select 1 from public.a02_recomendacoes
    where id = v_estado and situacao = 'adiada' and adiada_por = v_admin and adiada_ate is not null) then
    raise exception 'Adiamento não registrou responsável e prazo';
  end if;

  begin
    update public.a02_recomendacoes
    set situacao = 'adiada', adiada_ate = clock_timestamp() + interval '48 hours'
    where id = v_estado;
    raise exception 'Crítica foi adiada além de 24 horas';
  exception when check_violation then null;
  end;

  begin
    update public.a02_recomendacoes set situacao = 'dispensada' where id = v_estado;
    raise exception 'Dispensa sem motivo foi aceita';
  exception when check_violation then null;
  end;

  update public.a02_recomendacoes
    set situacao = 'dispensada', dispensada_motivo = 'Conferido com a gerência'
    where id = v_estado;
  if not exists (select 1 from public.a02_recomendacoes
    where id = v_estado and situacao = 'dispensada'
      and dispensada_por = v_admin and dispensada_em is not null
      and dispensada_motivo = 'Conferido com a gerência') then
    raise exception 'Dispensa não registrou responsável, data e motivo';
  end if;

  update public.a02_recomendacoes set situacao = 'pendente' where id = v_estado;
  if exists (select 1 from public.a02_recomendacoes
    where id = v_estado and (dispensada_em is not null or dispensada_motivo is not null)) then
    raise exception 'Reabertura não limpou a dispensa anterior';
  end if;

  update public.a02_recomendacoes
    set situacao = 'resolvida', resolvida_dados = '{"leitura":"confirmada"}'::jsonb
    where id = v_estado;
  if not exists (select 1 from public.a02_recomendacoes
    where id = v_estado and situacao = 'resolvida' and resolvida_por = v_admin and resolvida_em is not null) then
    raise exception 'Resolução não registrou responsável e data';
  end if;

  select acao into v_evento from public.a02_recomendacoes_historico
    where estado_id = v_estado order by id desc limit 1;
  if v_evento is distinct from 'resolvida' then
    raise exception 'Histórico não registrou a resolução';
  end if;

  -- 4) Histórico é somente leitura: nem o administrador grava ou apaga diretamente.
  begin
    insert into public.a02_recomendacoes_historico (estado_id, ator_id, ator_nome, acao)
    values (v_estado, v_admin, 'teste', 'detectada');
    raise exception 'Histórico foi gravado diretamente';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.a02_recomendacoes_historico where estado_id = v_estado;
    raise exception 'Histórico foi apagado';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- 5) Tarefas: exclusão lógica, lixeira, restauração, reabertura e anti-duplicidade.
set local role authenticated;
do $$
declare
  v_admin constant uuid := '2b9a0101-761a-4bfa-aaef-0060ab2ed701';
  v_equipe constant uuid := '2b9a0102-761a-4bfa-aaef-0060ab2ed702';
  v_cliente constant uuid := '2b9a0104-761a-4bfa-aaef-0060ab2ed704';
  v_estado uuid;
  v_tarefa uuid;
  v_afetadas integer;
begin
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  insert into public.a02_recomendacoes (recomendacao_id, chave, titulo, prioridade)
  values ('estoque-zerado', 'estoque-zerado', 'Estoque físico zerado', 'critica')
  returning id into v_estado;

  insert into public.a01_tarefas
    (titulo, origem, responsavel_id, recomendacao_id, rec_chave, rec_ocorrencia)
  values ('Tarefa da recomendação', 'manual', v_admin, 'estoque-zerado', 'estoque-zerado', 1)
  returning id into v_tarefa;

  -- 6) Anti-duplicidade: segunda tarefa da mesma ocorrência é recusada.
  begin
    insert into public.a01_tarefas
      (titulo, origem, responsavel_id,Recomendacao_id, rec_chave, rec_ocorrencia)
    values ('Tarefa duplicada', 'manual', v_admin, 'estoque-zerado', 'estoque-zerado', 1);
    raise exception 'Tarefa duplicada da mesma ocorrência foi aceita';
  exception when unique_violation then null;
  end;

  -- 7) Concluir a tarefa não resolve nem dispensa a recomendação.
  update public.a01_tarefas set concluida = true where id = v_tarefa and versao = 1;
  if not exists (select 1 from public.a01_tarefas
    where id = v_tarefa and concluida and concluida_por = v_admin and versao = 2) then
    raise exception 'Conclusão não preservou autor, data e versão';
  end if;
  if not exists (select 1 from public.a02_recomendacoes
    where id = v_estado and situacao = 'pendente') then
    raise exception 'Conclusão da tarefa alterou a situação da recomendação';
  end if;

  -- 8) Reabertura devolve a tarefa ao estado pendente e fica no histórico.
  update public.a01_tarefas set concluida = false where id = v_tarefa and versao = 2;
  if not exists (select 1 from public.a01_tarefas
    where id = v_tarefa and not concluida and concluida_em is null and concluida_por is null and versao = 3) then
    raise exception 'Reabertura não limpou a conclusão anterior';
  end if;
  if (select array_agg(acao order by versao) from public.a01_tarefas_historico where tarefa_id = v_tarefa)
    is distinct from array['criada', 'concluida', 'reaberta'] then
    raise exception 'Histórico da reabertura ficou incompleto';
  end if;

  -- 9) Exclusão lógica: exige motivo, preserva os dados e envia para a lixeira.
  begin
    update public.a01_tarefas set excluida = true where id = v_tarefa and versao = 3;
    raise exception 'Exclusão sem motivo foi aceita';
  exception when check_violation then null;
  end;

  update public.a01_tarefas
    set excluida = true, excluida_motivo = 'Registro duplicado pelo admin'
    where id = v_tarefa and versao = 3;
  if not exists (select 1 from public.a01_tarefas
    where id = v_tarefa and excluida and excluida_por = v_admin and excluida_em is not null
      and excluida_motivo = 'Registro duplicado pelo admin' and versao = 4) then
    raise exception 'Exclusão não registrou responsável, data, motivo e versão';
  end if;
  if not exists (select 1 from public.a01_tarefas_historico
    where tarefa_id = v_tarefa and acao = 'excluida') then
    raise exception 'Exclusão não ficou no histórico';
  end if;

  -- 10) Tarefa excluída não pode ser editada sem restauração.
  begin
    update public.a01_tarefas set titulo = 'Alteração indevida' where id = v_tarefa and versao = 4;
    raise exception 'Tarefa excluída aceitou edição';
  exception when insufficient_privilege then null;
  end;

  -- 11) Restauração devolve a tarefa às listas ativas.
  update public.a01_tarefas set excluida = false where id = v_tarefa and versao = 4;
  if not exists (select 1 from public.a01_tarefas
    where id = v_tarefa and not excluida and excluida_em is null and excluida_motivo is null and versao = 5) then
    raise exception 'Restauração não limpou os dados da exclusão';
  end if;
  if not exists (select 1 from public.a01_tarefas_historico
    where tarefa_id = v_tarefa and acao = 'restaurada') then
    raise exception 'Restauração não ficou no histórico';
  end if;

  -- 12) Tarefa concluída também pode ser excluída e restaurada.
  update public.a01_tarefas set concluida = true where id = v_tarefa and versao = 5;
  update public.a01_tarefas
    set excluida = true, excluida_motivo = 'Arquivamento após conclusão'
    where id = v_tarefa and versao = 6;
  if not exists (select 1 from public.a01_tarefas
    where id = v_tarefa and excluida and concluida and versao = 7) then
    raise exception 'Exclusão de tarefa concluída não preservou a conclusão';
  end if;
  update public.a01_tarefas set excluida = false where id = v_tarefa and versao = 7;
  if not exists (select 1 from public.a01_tarefas
    where id = v_tarefa and not excluida and concluida and versao = 8) then
    raise exception 'Restauração de tarefa concluída não preservou a conclusão';
  end if;

  -- 13) Equipe sem ADMIN não exclui nem restaura.
  perform set_config('request.jwt.claim.sub', v_equipe::text, true);
  update public.a01_tarefas
    set excluida = true, excluida_motivo = 'Tentativa indevida'
    where id = v_tarefa and versao = 8;
  get diagnostics v_afetadas = row_count;
  if v_afetadas <> 0 then
    raise exception 'Equipe excluiu tarefa sem ADMIN';
  end if;
  update public.a01_tarefas set concluida = false where id = v_tarefa and versao = 8;
  get diagnostics v_afetadas = row_count;
  if v_afetadas <> 0 then
    raise exception 'Responsável reabriu tarefa de outro responsável';
  end if;

  perform set_config('request.jwt.claim.sub', v_cliente::text, true);
  if exists (select 1 from public.a02_recomendacoes where id = v_estado) then
    raise exception 'Cliente leu a recomendação';
  end if;
end $$;
reset role;

select 'A02.1.2 OK: RLS de recomendações, ciência, adiamento, dispensa, resolução, exclusão, lixeira, restauração, reabertura e anti-duplicidade' as resultado;
rollback;
