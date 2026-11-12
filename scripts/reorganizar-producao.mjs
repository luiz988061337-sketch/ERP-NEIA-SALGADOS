/**
 * Reorganiza a pagina de Producao: shell do admin + cabecalho do modulo +
 * Kanban 3 colunas como conteudo principal, com o restante em secao recolhivel.
 * Cirurgia de texto: nao altera logica nem regras de negocio.
 */
import fs from "node:fs";

const P = "src/routes/producao.tsx";
let src = fs.readFileSync(P, "utf8");
const eol = src.includes("\r\n") ? "\r\n" : "\n";

// 1) Extrai o bloco do Kanban (marcadores estaveis)
const iniKanban = src.indexOf("        {/* Kanban de produção");
const fimKanban = src.indexOf("        {pedidosValidos.length === 0 ? (");
if (iniKanban < 0 || fimKanban < 0 || fimKanban < iniKanban) throw new Error("bloco do kanban nao localizado");
const kanban = src.slice(iniKanban, fimKanban);
src = src.slice(0, iniKanban) + src.slice(fimKanban);

// 2) Abertura do render: shell + cabecalho + kanban + detalhes
const aberturaAntiga = `    <>
      <AdminTopbar
        usuario={user?.email ?? null}
        acesso="Produção"
        onVoltar={() => navigate({ to: roles?.includes("admin") ? "/admin" : "/central-entregas" })}
        onSair={async () => {
          await supabase.auth.signOut();
          navigate({ to: "/auth", replace: true });
        }}
      />
      <div className="mx-auto max-w-5xl px-4 py-8">`;

const aberturaNova = `    <AdminShell
      aba="producao"
      onAba={() => {}}
      onRefresh={recarregar}
      usuario={user?.email ?? null}
      onSair={async () => {
        await supabase.auth.signOut();
        navigate({ to: "/auth", replace: true });
      }}
    >
      <AdminTopbar
        usuario={user?.email ?? null}
        acesso="Produção"
        onVoltar={() => navigate({ to: roles?.includes("admin") ? "/admin" : "/central-entregas" })}
        onSair={async () => {
          await supabase.auth.signOut();
          navigate({ to: "/auth", replace: true });
        }}
      />
      <div className="px-3 py-3">
        {/* Cabecalho do modulo (padrao da referencia) */}
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#D4A94A] bg-[#121110] px-4 py-3 shadow-card">
          <div className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-[#D4A94A] bg-[#1A1712]">
              <ChefHat className="size-4 text-[#F2CE6B]" aria-hidden />
            </span>
            <div className="min-w-0">
              <h1 className="truncate font-display text-lg font-bold uppercase leading-tight tracking-wide text-foreground">
                Produção — Cozinha
              </h1>
              <p className="text-xs text-muted-foreground">
                Pedidos organizados por status, com prioridades e tempo de preparo
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#35C97C]/55 bg-[#35C97C]/12 px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#35C97C]">
              <span className="size-1.5 rounded-full bg-[#35C97C]" aria-hidden />
              Cozinha
            </span>
            <span className="hidden text-[11px] text-muted-foreground sm:inline">
              Em operação
            </span>
          </div>
        </section>

${kanban}
        {/* Detalhes da operacao (secundario, recolhivel) */}
        <details className="group mt-4 overflow-hidden rounded-2xl border border-[#D4A94A] bg-[#121110] shadow-card">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 hover:bg-[#17150F]">
            <span className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide text-foreground">
              <ChevronRight
                className="size-4 text-[#F2CE6B] transition-transform group-open:rotate-90"
                aria-hidden
              />
              Operação em detalhes
            </span>
            <span className="hidden text-[11px] text-muted-foreground sm:block">
              totais do dia, consolidado, listas e filtros
            </span>
          </summary>
          <div className="border-t border-[#D4A94A]/35 p-3 sm:p-4">`;

if (!src.includes(aberturaAntiga)) throw new Error("abertura do render nao localizada");
src = src.replace(aberturaAntiga, aberturaNova);

// 3) Fecha detalhes + container + shell
const fechoAntigo = `        {pedidosValidos.length === 0 ? (
          <EmptyState titulo="Nenhum pedido na fila para este filtro" />
        ) : null}
      </div>
    </>
  );
}`;
const fechoNovo = `        {pedidosValidos.length === 0 ? (
          <EmptyState titulo="Nenhum pedido na fila para este filtro" />
        ) : null}
          </div>
        </details>
      </div>
    </AdminShell>
  );
}`;
if (!src.includes(fechoAntigo)) throw new Error("fecho do render nao localizado");
src = src.replace(fechoAntigo, fechoNovo);

// 4) Imports: AdminShell, ChevronRight
src = src.replace(
  'import { AdminTopbar } from "@/components/admin/admin-topbar";',
  'import { AdminTopbar } from "@/components/admin/admin-topbar";\nimport { AdminShell } from "@/components/admin/admin-shell";',
);
if (!/ChevronRight/.test(src.split("export const Route")[0])) {
  src = src.replace(/(\n\s+ChefHat,)/, "$1\n  ChevronRight,");
}

fs.writeFileSync(P, src, "utf8");
console.log("producao.tsx reorganizado:", src.length, "bytes");
