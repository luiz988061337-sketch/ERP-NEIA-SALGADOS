import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { SidebarTrigger } from "@/components/ui/sidebar";
import "./premium.css";

// Mesmo componente e modo de demonstração utilizados no Dashboard L2.
// O CSS financeiro fica DENTRO do SidebarInset: não reestiliza o menu real.
export function FinanceiroPreviewLayout({ children, onRelatorios }: { children: ReactNode; onRelatorios: () => void }) {
  return <div className="fp-admin-shell">
    <AdminShell
      aba="financeiro"
      onAba={destino => { if (destino === "dono") onRelatorios(); }}
      onRefresh={() => window.dispatchEvent(new Event("resize"))}
      usuario="neia@neiasalgados.com"
      modoPreview
    >
      <div className="fp-app" data-financeiro-revisao="acabamento-adminshell-v5">
        <div className="fp-mobile-menu"><SidebarTrigger aria-label="Abrir menu administrativo" /><span>Painel de Gestão</span></div>
        <div className="fp-main">{children}</div>
      </div>
    </AdminShell>
  </div>;
}

export function Panel({ title, icon: Icon, children, className = "", action }: { title: string; icon?: LucideIcon; children: ReactNode; className?: string; action?: ReactNode }) {
  return <section className={`fp-panel fp-frame ${className}`}>
    <div className="fp-panel-heading">{Icon && <Icon aria-hidden />}<h2>{title}</h2>{action}</div>
    {children}
  </section>;
}

export function Status({ children, tone = "neutral" }: { children: ReactNode; tone?: "good" | "warning" | "danger" | "neutral" }) {
  return <span className={`fp-status fp-status-${tone}`}>{children}</span>;
}
