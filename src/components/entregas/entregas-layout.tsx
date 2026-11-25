import type { ReactNode } from "react";

export function EntregasLayout({ mapa, rota }: { mapa: ReactNode; rota: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="min-w-0">{mapa}</div>
      <div className="min-w-0">{rota}</div>
    </div>
  );
}
