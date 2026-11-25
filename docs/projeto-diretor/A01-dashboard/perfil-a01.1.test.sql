-- A01.1. Valida o perfil usado nas tarefas com as políticas atuais. Executar somente em homologação.
begin;

insert into auth.users (id, email)
values
  ('a0110001-761a-4bfa-aaef-0060ab2ed701', 'a01-1-admin-test@invalid.example'),
  ('a0110002-761a-4bfa-aaef-0060ab2ed702', 'a01-1-equipe-test@invalid.example');

insert into public.user_roles (user_id, role)
values
  ('a0110001-761a-4bfa-aaef-0060ab2ed701', 'admin'),
  ('a0110002-761a-4bfa-aaef-0060ab2ed702', 'producao');

set local role authenticated;
do $$
declare
  admin_id constant uuid := 'a0110001-761a-4bfa-aaef-0060ab2ed701';
  equipe_id constant uuid := 'a0110002-761a-4bfa-aaef-0060ab2ed702';
  tarefa_id_teste uuid;
  linhas integer;
begin
  perform set_config('request.jwt.claim.sub', equipe_id::text, true);
  insert into public.profiles (id, nome) values (equipe_id, 'Equipe teste')
  on conflict (id) do update set nome = excluded.nome;

  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  insert into public.profiles (id, nome) values (admin_id, 'Administrador teste')
  on conflict (id) do update set nome = excluded.nome;

  insert into public.a01_tarefas (titulo, responsavel_id, compartilhada, prazo)
  values ('A01.1 teste atribuído', equipe_id, true, current_date - 1)
  returning id into tarefa_id_teste;
  if not exists (select 1 from public.a01_tarefas
    where id = tarefa_id_teste and criado_nome = 'Administrador teste' and responsavel_nome = 'Equipe teste') then
    raise exception 'Tarefa não registrou os nomes de perfil';
  end if;

  perform set_config('request.jwt.claim.sub', equipe_id::text, true);
  update public.profiles set nome = 'Nome indevido' where id = admin_id;
  get diagnostics linhas = row_count;
  if linhas <> 0 then raise exception 'Equipe conseguiu editar perfil de outra pessoa'; end if;
  if not exists (select 1 from public.a01_tarefas
    where id = tarefa_id_teste and responsavel_id = auth.uid() and not concluida and prazo < current_date) then
    raise exception 'Responsável não recebeu a tarefa compartilhada e vencida';
  end if;

  update public.a01_tarefas set prioridade='alta' where id = tarefa_id_teste;
  update public.a01_tarefas set concluida=true where id = tarefa_id_teste;

  insert into public.profiles (id, nome) values (equipe_id, 'Outro nome de teste')
  on conflict (id) do update set nome = excluded.nome;
  if not exists (select 1 from public.profiles where id=equipe_id and nome='Outro nome de teste') then
    raise exception 'Atualização do próprio perfil não persistiu';
  end if;
  if not exists (select 1 from public.a01_tarefas_historico
    where tarefa_id = tarefa_id_teste and acao='editada' and ator_id=equipe_id and ator_nome='Equipe teste'
      and anterior->>'prioridade'='normal' and atual->>'prioridade'='alta') or
     not exists (select 1 from public.a01_tarefas_historico
    where tarefa_id = tarefa_id_teste and acao='concluida' and ator_id=equipe_id and ator_nome='Equipe teste') then
    raise exception 'O histórico perdeu nomes ou valores anteriores';
  end if;
end $$;
reset role;
select 'A01.1 OK: nome próprio, segurança de perfil, atribuição, atraso e histórico' as resultado;
rollback;
