-- A02.1.2. Gerenciamento de tarefas (exclusão lógica, lixeira, restauração e reabertura).
-- Aplicação autorizada pelo proprietário no projeto de homologação lflzlcqinarrcgncafol.
-- Alterações aditivas e compatíveis: nenhum registro existente é removido.
-- Pré-requisito: 0125_a01_tarefas_administrativas.sql.

alter table public.a01_tarefas
  add column if not exists excluida boolean not null default false,
  add column if not exists excluida_em timestamptz,
  add column if not exists excluida_por uuid references auth.users(id) on delete restrict,
  add column if not exists excluida_motivo text
    check (char_length(btrim(excluida_motivo)) between 1 and 500),
  add column if not exists recomendacao_id text,
  add column if not exists rec_chave text,
  add column if not exists rec_ocorrencia integer;

alter table public.a01_tarefas drop constraint if exists a01_tarefas_exclusao_check;
alter table public.a01_tarefas add constraint a01_tarefas_exclusao_check check (
  (excluida and excluida_em is not null and excluida_por is not null and excluida_motivo is not null)
  or
  (not excluida and excluida_em is null and excluida_por is null and excluida_motivo is null)
);

-- Vínculo com a recomendação de origem e trava contra tarefa duplicada da mesma
-- ocorrência, inclusive em solicitações simultâneas.
create unique index if not exists a01_tarefas_recomendacao_unica
  on public.a01_tarefas (recomendacao_id, rec_chave, rec_ocorrencia)
  where recomendacao_id is not null and not concluida and not excluida;

-- Histórico passa a registrar reabertura, exclusão e restauração.
alter table public.a01_tarefas_historico drop constraint if exists a01_tarefas_historico_acao_check;
alter table public.a01_tarefas_historico add constraint a01_tarefas_historico_acao_check
  check (acao in ('criada', 'editada', 'concluida', 'sugestao_aprovada', 'reaberta', 'excluida', 'restaurada'));

grant insert (recomendacao_id, rec_chave, rec_ocorrencia)
  on public.a01_tarefas to authenticated;
grant update (concluida, concluida_em, concluida_por,
  excluida, excluida_em, excluida_por, excluida_motivo,
  recomendacao_id, rec_chave, rec_ocorrencia)
  on public.a01_tarefas to authenticated;

drop policy if exists a01_tarefas_edicao on public.a01_tarefas;
create policy a01_tarefas_edicao on public.a01_tarefas for update to authenticated
  using (
    (select a01_privado.equipe(auth.uid())) and
    ((select public.has_role(auth.uid(), 'admin')) or
      criado_por = (select auth.uid()) or responsavel_id = (select auth.uid()))
  )
  with check (
    (select a01_privado.equipe(auth.uid())) and
    ((select public.has_role(auth.uid(), 'admin')) or
      criado_por = (select auth.uid()) or responsavel_id = (select auth.uid()))
  );

create or replace function a01_privado.preparar_tarefa()
returns trigger
language plpgsql security definer
set search_path = pg_catalog
as $$
declare
  ator uuid := auth.uid();
  administrador boolean := public.has_role(ator, 'admin');
  reabrindo boolean := false;
  excluindo boolean := false;
  restaurando boolean := false;
begin
  if not a01_privado.equipe(ator) then
    raise exception 'Operação restrita à equipe.' using errcode = '42501';
  end if;

  new.titulo := btrim(new.titulo);
  if tg_op = 'INSERT' then
    if new.criado_por is distinct from ator then
      raise exception 'O criador deve ser o usuário autenticado.' using errcode = '42501';
    end if;
    if new.responsavel_id is distinct from ator and (not administrador or new.origem = 'inteligencia') then
      raise exception 'A tarefa precisa ser confirmada pelo próprio responsável.' using errcode = '42501';
    end if;
    if not a01_privado.equipe(new.responsavel_id) then
      raise exception 'Selecione um responsável da equipe.' using errcode = '23514';
    end if;
    if new.rec_ocorrencia is not null and new.rec_ocorrencia < 1 then
      raise exception 'Ocorrência inválida.' using errcode = '23514';
    end if;
    new.criado_nome := a01_privado.nome_equipe(ator);
    new.responsavel_nome := a01_privado.nome_equipe(new.responsavel_id);
    return new;
  end if;

  reabrindo := old.concluida and not new.concluida;
  excluindo := (not old.excluida) and new.excluida;
  restaurando := old.excluida and (not new.excluida);

  if old.excluida and not restaurando then
    raise exception 'Tarefa excluída: restaure antes de editar.' using errcode = '42501';
  end if;
  if excluindo and not administrador then
    raise exception 'Somente o administrador exclui tarefas.' using errcode = '42501';
  end if;
  if restaurando and not administrador then
    raise exception 'Somente o administrador restaura tarefas.' using errcode = '42501';
  end if;

  -- Exclusão e restauração preservam todos os dados da tarefa: só o estado da
  -- lixeira, o motivo, a versão e a data de atualização mudam.
  if excluindo or restaurando then
    if (to_jsonb(new) - 'excluida' - 'excluida_em' - 'excluida_por' - 'excluida_motivo'
          - 'atualizada_em' - 'versao')
       is distinct from
       (to_jsonb(old) - 'excluida' - 'excluida_em' - 'excluida_por' - 'excluida_motivo'
          - 'atualizada_em' - 'versao') then
      raise exception 'A exclusão e a restauração preservam os dados da tarefa.' using errcode = '42501';
    end if;
    if excluindo then
      if new.excluida_motivo is null or btrim(new.excluida_motivo) = '' then
        raise exception 'Informe o motivo da exclusão.' using errcode = '23514';
      end if;
      new.excluida_em := clock_timestamp();
      new.excluida_por := ator;
    else
      new.excluida_em := null;
      new.excluida_por := null;
      new.excluida_motivo := null;
    end if;
    new.versao := old.versao + 1;
    new.atualizada_em := clock_timestamp();
    return new;
  end if;

  if reabrindo and not (administrador or ator = old.criado_por or ator = old.responsavel_id) then
    raise exception 'Somente o administrador, o criador ou o responsável reabre a tarefa.' using errcode = '42501';
  end if;
  if old.concluida and not reabrindo then
    -- Tarefa encerrada não é editável: a alteração é ignorada (0 linhas afetadas),
    -- preservando o comportamento aprovado na A01. Para reabrir, use a ação
    -- explícita, que altera apenas o campo de conclusão.
    return null;
  end if;
  if (not administrador and ator <> old.criado_por and ator <> old.responsavel_id) then
    raise exception 'Tarefa fora da sua responsabilidade.' using errcode = '42501';
  end if;
  if new.responsavel_id is distinct from old.responsavel_id then
    if not administrador then
      raise exception 'Somente o administrador altera o responsável.' using errcode = '42501';
    end if;
    if not a01_privado.equipe(new.responsavel_id) then
      raise exception 'Selecione um responsável da equipe.' using errcode = '23514';
    end if;
    new.responsavel_nome := a01_privado.nome_equipe(new.responsavel_id);
  end if;
  if new.compartilhada is distinct from old.compartilhada and not administrador and ator <> old.criado_por then
    raise exception 'Somente o criador ou administrador altera a visibilidade.' using errcode = '42501';
  end if;
  if new.concluida then
    new.concluida_em := clock_timestamp();
    new.concluida_por := ator;
  elsif reabrindo then
    new.concluida_em := null;
    new.concluida_por := null;
  end if;
  new.versao := old.versao + 1;
  new.atualizada_em := clock_timestamp();
  return new;
end;
$$;

create or replace function a01_privado.registrar_historico()
returns trigger
language plpgsql security definer
set search_path = pg_catalog
as $$
declare
  ator uuid := auth.uid();
  evento text;
  estado_anterior jsonb;
begin
  if not a01_privado.equipe(ator) then
    raise exception 'Histórico exige identificação de funcionário.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    evento := case when new.origem = 'inteligencia' then 'sugestao_aprovada' else 'criada' end;
  else
    evento := case
      when new.excluida and not old.excluida then 'excluida'
      when old.excluida and not new.excluida then 'restaurada'
      when old.concluida and not new.concluida then 'reaberta'
      when new.concluida then 'concluida'
      else 'editada'
    end;
    estado_anterior := to_jsonb(old);
  end if;
  insert into public.a01_tarefas_historico
    (tarefa_id, ator_id, ator_nome, acao, versao, anterior, atual)
  values
    (new.id, ator, a01_privado.nome_equipe(ator), evento, new.versao, estado_anterior, to_jsonb(new));
  return null;
end;
$$;

revoke all on function a01_privado.preparar_tarefa(), a01_privado.registrar_historico()
  from public, anon, authenticated, service_role;
