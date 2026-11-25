-- A01. Tarefas administrativas. Aplicação autorizada no projeto de homologação lflzlcqinarrcgncafol.
-- Esta migration acrescenta estruturas de tarefas e não modifica tabelas ou políticas anteriores.

create schema a01_privado;
revoke all on schema a01_privado from public;
grant usage on schema a01_privado to authenticated;

create function a01_privado.equipe(usuario_id uuid)
returns boolean
language sql stable
set search_path = pg_catalog
as $$
  select usuario_id is not null and (
    public.has_role(usuario_id, 'admin') or
    public.has_role(usuario_id, 'atendente') or
    public.has_role(usuario_id, 'producao') or
    public.has_role(usuario_id, 'financeiro') or
    public.has_role(usuario_id, 'motoboy')
  );
$$;
revoke all on function a01_privado.equipe(uuid) from public;
grant execute on function a01_privado.equipe(uuid) to authenticated;

create table public.a01_tarefas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (char_length(btrim(titulo)) between 1 and 160),
  descricao text not null default '' check (char_length(descricao) <= 2000),
  prioridade text not null default 'normal' check (prioridade in ('baixa', 'normal', 'alta', 'critica')),
  prazo date,
  compartilhada boolean not null default false,
  origem text not null default 'manual' check (origem in ('manual', 'inteligencia')),
  criado_por uuid not null references auth.users(id) on delete restrict default auth.uid(),
  responsavel_id uuid not null references auth.users(id) on delete restrict default auth.uid(),
  criado_nome text not null default '',
  responsavel_nome text not null default '',
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now(),
  versao integer not null default 1 check (versao > 0),
  concluida boolean not null default false,
  concluida_em timestamptz,
  concluida_por uuid references auth.users(id) on delete restrict,
  check (
    (concluida and concluida_em is not null and concluida_por is not null) or
    (not concluida and concluida_em is null and concluida_por is null)
  )
);

create index a01_tarefas_criador_idx on public.a01_tarefas (criado_por);
create index a01_tarefas_responsavel_idx on public.a01_tarefas (responsavel_id);
create index a01_tarefas_concluida_por_idx on public.a01_tarefas (concluida_por) where concluida_por is not null;
create index a01_tarefas_pendentes_prazo_idx on public.a01_tarefas (prazo asc nulls last, id) where not concluida;

create table public.a01_tarefas_historico (
  id bigint generated always as identity primary key,
  tarefa_id uuid not null references public.a01_tarefas(id) on delete restrict,
  ator_id uuid not null references auth.users(id) on delete restrict,
  ator_nome text not null,
  acao text not null check (acao in ('criada', 'editada', 'concluida', 'sugestao_aprovada')),
  versao integer not null,
  ocorrido_em timestamptz not null default now(),
  anterior jsonb,
  atual jsonb not null,
  unique (tarefa_id, versao)
);
create index a01_tarefas_historico_ator_idx on public.a01_tarefas_historico (ator_id);

alter table public.a01_tarefas enable row level security;
alter table public.a01_tarefas_historico enable row level security;
revoke all on public.a01_tarefas, public.a01_tarefas_historico from anon, authenticated, public, service_role;
revoke all on sequence public.a01_tarefas_historico_id_seq from anon, authenticated, public, service_role;

grant select on public.a01_tarefas, public.a01_tarefas_historico to authenticated;
grant insert (titulo, descricao, prioridade, prazo, compartilhada, origem, responsavel_id)
  on public.a01_tarefas to authenticated;
grant update (titulo, descricao, prioridade, prazo, compartilhada, responsavel_id, concluida)
  on public.a01_tarefas to authenticated;

create policy a01_tarefas_leitura on public.a01_tarefas for select to authenticated
using (
  (select a01_privado.equipe(auth.uid())) and
  ((select public.has_role(auth.uid(), 'admin')) or compartilhada or
    criado_por = (select auth.uid()) or responsavel_id = (select auth.uid()))
);
create policy a01_tarefas_criacao on public.a01_tarefas for insert to authenticated
with check ((select a01_privado.equipe(auth.uid())) and criado_por = (select auth.uid()));
create policy a01_tarefas_edicao on public.a01_tarefas for update to authenticated
using (
  (select a01_privado.equipe(auth.uid())) and not concluida and
  ((select public.has_role(auth.uid(), 'admin')) or
    criado_por = (select auth.uid()) or responsavel_id = (select auth.uid()))
)
with check (
  (select a01_privado.equipe(auth.uid())) and
  ((select public.has_role(auth.uid(), 'admin')) or
    criado_por = (select auth.uid()) or responsavel_id = (select auth.uid()))
);

create policy a01_tarefas_historico_leitura on public.a01_tarefas_historico for select to authenticated
using (
  (select a01_privado.equipe(auth.uid())) and exists (
    select 1 from public.a01_tarefas t
    where t.id = tarefa_id and
      ((select public.has_role(auth.uid(), 'admin')) or
        t.criado_por = (select auth.uid()) or t.responsavel_id = (select auth.uid()))
  )
);

create function a01_privado.nome_equipe(usuario_id uuid)
returns text
language sql stable security definer
set search_path = pg_catalog
as $$
  select coalesce(
    (select left(nullif(btrim(p.nome), ''), 160) from public.profiles p where p.id = usuario_id),
    'Colaborador ' || left(usuario_id::text, 8)
  );
$$;
revoke all on function a01_privado.nome_equipe(uuid) from public, anon, authenticated, service_role;

create function a01_privado.preparar_tarefa()
returns trigger
language plpgsql security definer
set search_path = pg_catalog
as $$
declare
  ator uuid := auth.uid();
  administrador boolean := public.has_role(ator, 'admin');
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
    new.criado_nome := a01_privado.nome_equipe(ator);
    new.responsavel_nome := a01_privado.nome_equipe(new.responsavel_id);
    return new;
  end if;

  if old.concluida or (not administrador and ator <> old.criado_por and ator <> old.responsavel_id) then
    raise exception 'Tarefa encerrada ou fora da sua responsabilidade.' using errcode = '42501';
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
  end if;
  new.versao := old.versao + 1;
  new.atualizada_em := clock_timestamp();
  return new;
end;
$$;

create function a01_privado.registrar_historico()
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
    evento := case when new.concluida then 'concluida' else 'editada' end;
    estado_anterior := to_jsonb(old);
  end if;
  insert into public.a01_tarefas_historico
    (tarefa_id, ator_id, ator_nome, acao, versao, anterior, atual)
  values
    (new.id, ator, a01_privado.nome_equipe(ator), evento, new.versao, estado_anterior, to_jsonb(new));
  return null;
end;
$$;

create trigger a01_tarefas_preparar
before insert or update on public.a01_tarefas for each row execute function a01_privado.preparar_tarefa();
create trigger a01_tarefas_auditar
after insert or update on public.a01_tarefas for each row execute function a01_privado.registrar_historico();

revoke all on function a01_privado.preparar_tarefa(), a01_privado.registrar_historico()
from public, anon, authenticated, service_role;

-- A publicação usa a política SELECT da nova tabela para filtrar os avisos.
alter publication supabase_realtime add table public.a01_tarefas;
