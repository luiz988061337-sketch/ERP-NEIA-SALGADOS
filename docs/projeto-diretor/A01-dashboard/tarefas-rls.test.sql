-- Execute somente em homologação ou banco descartável. Todos os dados deste teste são revertidos.
begin;

insert into auth.users (id, email)
values
  ('1b9a0101-761a-4bfa-aaef-0060ab2ed701', 'a01-admin-test@invalid.example'),
  ('1b9a0102-761a-4bfa-aaef-0060ab2ed702', 'a01-equipe-test@invalid.example'),
  ('1b9a0103-761a-4bfa-aaef-0060ab2ed703', 'a01-outra-test@invalid.example'),
  ('1b9a0104-761a-4bfa-aaef-0060ab2ed704', 'a01-cliente-test@invalid.example');

insert into public.user_roles (user_id, role)
values
  ('1b9a0101-761a-4bfa-aaef-0060ab2ed701', 'admin'),
  ('1b9a0102-761a-4bfa-aaef-0060ab2ed702', 'producao'),
  ('1b9a0103-761a-4bfa-aaef-0060ab2ed703', 'atendente'),
  ('1b9a0104-761a-4bfa-aaef-0060ab2ed704', 'cliente')
on conflict do nothing;

set local role anon;
do $$
begin
  perform 1 from public.a01_tarefas;
  raise exception 'O papel anon conseguiu ler tarefas';
exception when insufficient_privilege then null;
end $$;
reset role;

set local role authenticated;
do $$
declare
  admin_id constant uuid := '1b9a0101-761a-4bfa-aaef-0060ab2ed701';
  equipe_id constant uuid := '1b9a0102-761a-4bfa-aaef-0060ab2ed702';
  outra_id constant uuid := '1b9a0103-761a-4bfa-aaef-0060ab2ed703';
  cliente_id constant uuid := '1b9a0104-761a-4bfa-aaef-0060ab2ed704';
  id_individual uuid;
  id_compartilhada uuid;
  id_atribuida uuid;
  id_sugestao uuid;
  afetadas integer;
begin
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  insert into public.a01_tarefas (titulo, prazo, prioridade)
  values ('A01 teste individual', current_date - 1, 'alta') returning id into id_individual;
  insert into public.a01_tarefas (titulo, compartilhada)
  values ('A01 teste compartilhada', true) returning id into id_compartilhada;
  insert into public.a01_tarefas (titulo, responsavel_id)
  values ('A01 teste atribuída', equipe_id) returning id into id_atribuida;

  if (select count(*) from public.a01_tarefas where criado_por = admin_id
    and char_length(criado_nome) > 0 and char_length(responsavel_nome) > 0) <> 3 then
    raise exception 'Admin não viu as tarefas criadas com identificação';
  end if;
  begin
    insert into public.a01_tarefas (titulo, responsavel_id) values ('A01 inválida', cliente_id);
    raise exception 'Admin atribuiu tarefa a cliente';
  exception when check_violation then null;
  end;
  begin
    insert into public.a01_tarefas (titulo, origem, responsavel_id)
    values ('A01 aprovação por terceiro', 'inteligencia', equipe_id);
    raise exception 'Admin aprovou sugestão em nome do responsável';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claim.sub', equipe_id::text, true);
  if exists (select 1 from public.a01_tarefas where id = id_individual) or
     (select count(*) from public.a01_tarefas where id in (id_compartilhada, id_atribuida)) <> 2 then
    raise exception 'RLS incorreta na leitura para equipe';
  end if;
  if exists (select 1 from public.a01_tarefas_historico where tarefa_id = id_compartilhada) then
    raise exception 'Observador da tarefa compartilhada viu o histórico reservado';
  end if;
  update public.a01_tarefas set titulo = 'Edição indevida' where id = id_compartilhada;
  get diagnostics afetadas = row_count;
  if afetadas <> 0 then raise exception 'Observador editou tarefa compartilhada'; end if;

  insert into public.a01_tarefas (titulo, origem, responsavel_id)
  values ('A01 sugestão confirmada pelo responsável', 'inteligencia', equipe_id) returning id into id_sugestao;
  if not exists (select 1 from public.a01_tarefas_historico
    where tarefa_id = id_sugestao and acao = 'sugestao_aprovada' and ator_id = equipe_id) then
    raise exception 'A aprovação explícita não gerou evento no histórico';
  end if;

  begin
    update public.a01_tarefas set responsavel_id = outra_id where id = id_atribuida;
    raise exception 'Responsável transferiu tarefa sem ser admin';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.a01_tarefas set compartilhada = true where id = id_atribuida;
    raise exception 'Responsável mudou a visibilidade sem ser criador ou admin';
  exception when insufficient_privilege then null;
  end;
  update public.a01_tarefas set prioridade = 'critica', prazo = current_date + 1
    where id = id_atribuida and versao = 1;
  get diagnostics afetadas = row_count;
  if afetadas <> 1 then raise exception 'Responsável não editou sua tarefa'; end if;
  update public.a01_tarefas set prazo = current_date + 2 where id = id_atribuida and versao = 1;
  get diagnostics afetadas = row_count;
  if afetadas <> 0 then raise exception 'Edição concorrente desatualizada foi aplicada'; end if;

  update public.a01_tarefas set concluida = true where id = id_atribuida and versao = 2;
  if not exists (select 1 from public.a01_tarefas
    where id = id_atribuida and concluida and concluida_por = equipe_id and concluida_em is not null and versao = 3) then
    raise exception 'Conclusão não preservou autor, data e versão';
  end if;
  if (select array_agg(acao order by versao) from public.a01_tarefas_historico where tarefa_id = id_atribuida)
    is distinct from array['criada', 'editada', 'concluida'] then
    raise exception 'Histórico de criação, edição e conclusão incompleto';
  end if;
  begin
    delete from public.a01_tarefas_historico where tarefa_id = id_atribuida;
    raise exception 'Histórico foi alterado diretamente';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claim.sub', outra_id::text, true);
  if exists (select 1 from public.a01_tarefas where id in (id_atribuida, id_individual, id_sugestao)) then
    raise exception 'Equipe sem atribuição viu tarefas privadas';
  end if;

  perform set_config('request.jwt.claim.sub', cliente_id::text, true);
  if exists (select 1 from public.a01_tarefas where id in (id_individual, id_compartilhada, id_atribuida)) then
    raise exception 'Cliente viu tarefas administrativas';
  end if;
  begin
    insert into public.a01_tarefas (titulo) values ('A01 cliente indevido');
    raise exception 'Cliente criou tarefa';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  update public.a01_tarefas set responsavel_id = outra_id where id = id_individual;
  if not exists (select 1 from public.a01_tarefas_historico where tarefa_id = id_individual
    and acao = 'editada' and anterior->>'responsavel_id' = admin_id::text and atual->>'responsavel_id' = outra_id::text) then
    raise exception 'Transferência feita pelo admin ficou sem histórico';
  end if;
  update public.a01_tarefas set titulo = 'A01 encerrada indevida' where id = id_atribuida;
  get diagnostics afetadas = row_count;
  if afetadas <> 0 then raise exception 'Tarefa concluída ainda estava editável'; end if;
end $$;

reset role;
select 'A01 OK: RBAC, RLS, criação, edição, atribuição, concorrência, conclusão e auditoria' as resultado;
rollback;
