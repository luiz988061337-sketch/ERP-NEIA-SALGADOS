import { Link } from "@tanstack/react-router";
import { Crown, Headphones, ShieldCheck } from "lucide-react";
import { useState } from "react";

export function FidelidadeCliente() {
  return (
    <aside className="r2b-loyalty" aria-label="Plano Fidelidade Néia">
      <div className="r2b-loyalty-heading">
        <Crown size={28} />
        <div><h2>Plano Fidelidade Néia</h2><p>Seus pedidos valem recompensas!</p></div>
        <strong>120 <small>pontos</small></strong>
      </div>
      <div className="r2b-loyalty-reward"><span>Ganhe um cupom de <b>R$ 20,00</b></span><span>120 / 200 pts</span></div>
      <div className="r2b-loyalty-progress" role="progressbar" aria-label="Pontos de fidelidade" aria-valuenow={120} aria-valuemin={0} aria-valuemax={200}><span /></div>
      <p className="r2b-loyalty-note">Faltam só 80 pontos para sua próxima recompensa!</p>
    </aside>
  );
}

export function AjudaCliente({ detalhe = false }: { detalhe?: boolean }) {
  const [atendimento, setAtendimento] = useState(false);
  return (
    <section className="r2b-help r2b-gradient" data-testid="r2b-ajuda">
      <div className="r2b-help-copy">
        <ShieldCheck size={32} />
        <div><h2>Precisa de ajuda com {detalhe ? "este pedido" : "algum pedido"}?</h2>
          <p>Teve algum problema com os produtos, a entrega ou o pagamento?<br />Informe o ocorrido e solicite um reembolso total ou parcial, se aplicável.</p></div>
      </div>
      <div className="r2b-help-actions">
        <Link to="/preview/reembolsos-estornos-cliente/novo" className="r2b-button r2b-button-light">{detalhe ? "Informar problema ou solicitar reembolso" : "Solicitar reembolso ou estorno"}</Link>
        {detalhe && <button type="button" className="r2b-button r2b-button-glass" onClick={() => setAtendimento(!atendimento)}><Headphones size={16} />Falar com a atendente</button>}
      </div>
      {atendimento && <p role="status">Atendimento demonstrativo. Nenhuma mensagem será enviada nesta prévia.</p>}
    </section>
  );
}
