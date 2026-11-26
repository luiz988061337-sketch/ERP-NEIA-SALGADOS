-- A02.1.2. Gestão de recomendações preventivas (Néia Inteligência).
-- Aplicação autorizada pelo proprietário no projeto de homologação lflzlcqinarrcgncafol.
-- Tabelas novas e aditivas: não altera nem remove registros existentes.
-- Pré-requisito: 0125_a01_tarefas_administrativas.sql (a01_tarefas e a01_privado.nome_equipe).

create schema a02_privado;
revoke all on schema a02_privado from public;
grant usage on schema a02_privado to authenticated;

create table public.a02_recomendacoes (
  id uuid primary key default gen_random_uuid(),
  recomendacao_id text not null check (char_length(btrim(recomendacao_id)) between 1 and 80),
  chave text not null check (char_length(btrim(chave)) between 1 and 160),
  ocorrencia integer not null default 1 check (ocorrencia > 0),
  situacao text not null default 'pendente'
    check (situacao in ('pendente', 'ciente', 'adiada', 'dispensada', 'resolvida')),
  prioridade text not null default 'normal'
    check (prioridade in ('baixa', 'normal', 'alta', 'critica')),
  titulo text not null check (char_length(btrim(titulo)) between 1 and 200),
  criado_por uuid not null references auth.users(id) on delete restrict default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id) on delete restrict,
  atualizado_em timestamptz not null default now(),
  ciente_em timestamptz,
  ciente_por uuid references auth.users(id) on delete restrict,
  adiada_em timestamptz,
  adiada_por uuid references auth.users(id) on delete restrict,
  adiada_ate timestamptz,
  dispensada_em timestamptz,
  dispensada_por uuid references auth.users(id) on delete restrict,
  dispensada_motivo text check (char_length(btrim(dispensada_motivo)) between 1 and 500),
  resolvida_em timestamptz,
  resolvida_por uuid references auth.users(id) on delete restrict,
  resolvida_dados jsonb,
  tarefa_id uuid references public.a01_tarefas(id) on delete set null,
  unique (recomendacao_id, chave, ocorrencia),
  check (
    (situacao = 'dispensada') =
    (dispensada_em is not null and dispensada_por is not null and dispensada_motivo is not null)
  ),
  check (
    situacao <> 'adiada' or
    (adiada_em is not null and adiada_por is not null and adiada_ate is not null)
  ),
  check (
    situacao <> 'resolvida' or (resolvida_em is not null and resolvida_por is not null)
  )
);

create index a02_recomendacoes_chave_idx on public.a02_recomendacoes (recomendacao_id, chave);
create index a02_recomendacoes_situacao_idx on public.a02_recomendacoes (situacao);
create index a02_recomendacoes_tarefa_idx on public.a02_recomendacoes (tarefa_id) where tarefa_id is not null;

create table public.a02_recomendacoes_historico (
  id bigint generated always as identity primary key,
  estado_id uuid not null references public.a02_recomendacoes(id) on delete restrict,
  ator_id uuid not null references auth.users(id) on delete restrict,
  ator_nome text not null,
  acao text not null check (acao in
    ('detectada', 'ciente', 'adiada', 'dispensada', 'resolvida', 'reaberta', 'ocorrencia', 'tarefa_vinculada')),
  detalhe jsonb,
  ocorreu_em timestamptz not null default now()
);
create index a02_recomendacoes_historico_estado_idx on public.a02_recomendacoes_historico (estado_id);

alter table public.a02_recomendacoes enable row level security;
alter table public.a02_recomendacoes_historico enable row level security;
revoke all on public.a02_recomendacoes, public.a02_recomendacoes_historico
  from anon, authenticated, public, service_role;
revoke all on sequence public.a02_recomendacoes_historico_id_seq
  from anon, authenticated, public, service_role;

-- Leitura e gerência dos estados apenas pelo administrador; o histórico é
-- somente leitura e recebe gravação exclusivamente pela trigger.
grant select on public.a02_recomendacoes, public.a02_recomendacoes_historico to authenticated;
grant insert, update on public.a02_recomendacoes to authenticated;

create policy a02_recomendacoes_leitura on public.a02_recomendacoes for select to authenticated
  using ((select public.has_role(auth.uid(), 'admin')));
create policy a02_recomendacoes_gerencia on public.a02_recomendacoes for insert to authenticated
  with check ((select public.has_role(auth.uid(), 'admin')) and criado_por = (select auth.uid()));
create policy a02_recomendacoes_atualizacao on public.a02_recomendacoes for update to authenticated
  using ((select public.has_role(auth.uid(), 'admin')))
  with check ((select public.has_role(auth.uid(), 'admin')));
create policy a02_recomendacoes_historico_leitura on public.a02_recomendacoes_historico
  for select to authenticated
  using ((select public.has_role(auth.uid(), 'admin')));

create or replace function a02_privado.preparar_recomendacao()
returns trigger
language plpgsql security definer
set search_path = pg_catalog
as $$
declare
  ator uuid := auth.uid();
begin
  if not (select public.has_role(ator, 'admin')) then
    raise exception 'Somente o administrador gerencia recomendações.' using errcode = '42501';
  end if;

  new.recomendacao_id := btrim(new.recomendacao_id);
  new.chave := btrim(new.chave);
  new.titulo := btrim(new.titulo);
  new.atualizado_em := clock_timestamp();
  new.atualizado_por := ator;

  if tg_op = 'UPDATE' then
    if new.situacao is not distinct from old.situacao then
      -- Sem mudança de situação: os campos da situação não podem ser alterados.
      if new.dispensada_motivo is distinct from old.dispensada_motivo then
        raise exception 'O motivo da dispensa só muda junto com a situação.' using errcode = '23514';
      end if;
      if new.adiada_ate is distinct from old.adiada_ate then
        raise exception 'O prazo do adiamento só muda junto com a situação.' using errcode = '23514';
      end if;
    else
      if new.situacao = 'ciente' then
        new.ciente_em := clock_timestamp();
        new.ciente_por := ator;
      end if;

      if new.situacao = 'adiada' then
        if new.adiada_ate is null then
          raise exception 'Informe o prazo do adiamento.' using errcode = '23514';
        end if;
        -- Tolerância de 5 minutos para o relógio do servidor não recusar o
        -- limite de 24 horas definido na interface.
        if new.prioridade = 'critica'
          and new.adiada_ate > clock_timestamp() + interval '24 hours' + interval '5 minutes' then
          raise exception 'Alerta crítico só pode ser adiado por até 24 horas.' using errcode = '23514';
        end if;
        new.adiada_em := clock_timestamp();
        new.adiada_por := ator;
      else
        new.adiada_em := null;
        new.adiada_por := null;
        new.adiada_ate := null;
      end if;

      if new.situacao = 'dispensada' then
        if new.dispensada_motivo is null or btrim(new.dispensada_motivo) = '' then
          raise exception 'Informe o motivo da dispensa.' using errcode = '23514';
        end if;
        new.dispensada_em := clock_timestamp();
        new.dispensada_por := ator;
      else
        new.dispensada_em := null;
        new.dispensada_por := null;
        new.dispensada_motivo := null;
      end if;

      if new.situacao = 'resolvida' then
        new.resolvida_em := clock_timestamp();
        new.resolvida_por := ator;
      else
        new.resolvida_em := null;
        new.resolvida_por := null;
        new.resolvida_dados := null;
      end if;
    end if;

    -- A prioridade é reavaliada pelo motor somente com a situação pendente
    -- (reativação/reabertura); nas demais situações o valor é preservado.
    if new.prioridade is distinct from old.prioridade and new.situacao <> 'pendente' then
      raise exception 'A prioridade da recomendação é definida pelo motor.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create or replace function a02_privado.registrar_historico_recomendacao()
returns trigger
language plpgsql security definer
set search_path = pg_catalog
as $$
declare
  ator uuid := auth.uid();
  evento text;
  detalhe jsonb;
begin
  if tg_op = 'INSERT' then
    evento := case when new.ocorrencia > 1 then 'ocorrencia' else 'detectada' end;
    detalhe := jsonb_build_object(
      'situacao', new.situacao,
      'prioridade', new.prioridade,
      'ocorrencia', new.ocorrencia
    );
  else
    if new.situacao is distinct from old.situacao then
      if new.situacao = 'pendente' then
        evento := 'reaberta';
      else
        evento := new.situacao;
      end if;
      detalhe := jsonb_build_object(
        'de', old.situacao,
        'para', new.situacao,
        'motivo', new.dispensada_motivo,
        'ate', new.adiada_ate,
        'evidencia', new.resolvida_dados
      );
    elsif new.tarefa_id is distinct from old.tarefa_id then
      evento := 'tarefa_vinculada';
      detalhe := jsonb_build_object('tarefa_id', new.tarefa_id);
    else
      return null;
    end if;
  end if;
  insert into public.a02_recomendacoes_historico
    (estado_id, ator_id, ator_nome, acao, detalhe)
  values
    (new.id, ator, a01_privado.nome_equipe(ator), evento, detalhe);
  return null;
end;
$$;

create trigger a02_recomendacoes_preparar
  before insert or update on public.a02_recomendacoes
  for each row execute function a02_privado.preparar_recomendacao();
create trigger a02_recomendacoes_auditar
  after insert or update on public.a02_recomendacoes
  for each row execute function a02_privado.registrar_historico_recomendacao();

revoke all on function a02_privado.preparar_recomendacao(), a02_privado.registrar_historico_recomendacao()
  from public, anon, authenticated, service_role;

alter publication supabase_realtime add table public.a02_recomendacoes;
