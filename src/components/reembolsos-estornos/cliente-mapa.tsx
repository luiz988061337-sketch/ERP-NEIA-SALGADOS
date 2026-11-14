import { Bike, Home, Store } from "lucide-react";

// Ilustração local em pixels SVG: sem coordenadas geográficas, tiles, API ou GPS.
export function MapaDemonstrativoCliente() {
  return (
    <figure className="r2b-map" data-testid="r2b-mapa">
      <div className="r2b-map-viewport" tabIndex={0} aria-label="Mapa ilustrativo; deslize para ver todo o percurso no celular">
      <svg viewBox="0 0 1120 360" role="img" aria-labelledby="r2b-map-title r2b-map-desc">
        <title id="r2b-map-title">Percurso demonstrativo da entrega</title>
        <desc id="r2b-map-desc">Ruas ilustrativas, loja à esquerda, motoboy no percurso laranja e destino do cliente à direita. Não representa um mapa real.</desc>
        <defs>
          <pattern id="r2b-map-blocks" width="150" height="100" patternUnits="userSpaceOnUse" patternTransform="rotate(-9)">
            <rect width="150" height="100" fill="#e9e8df" />
            <rect x="12" y="12" width="126" height="76" rx="8" fill="#f4f1e9" stroke="#dedbd0" />
            <path d="M0 0H150M0 0V100" fill="none" stroke="#fff" strokeWidth="13" />
          </pattern>
          <filter id="r2b-map-shadow" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity=".18" /></filter>
        </defs>
        <rect width="1120" height="360" fill="url(#r2b-map-blocks)" />
        <path d="M890 -20Q790 95 860 200T810 390" stroke="#b9dce5" strokeWidth="36" fill="none" />
        <path d="M920 -20Q820 95 890 200T840 390" stroke="#d1e6c2" strokeWidth="20" fill="none" />
        <g fill="#d4e3c6" stroke="#c4d8b5"><path d="M30 20h155v75H30z" /><path d="M415 225h145v105H415z" /><path d="M980 35h110v95H980z" /></g>
        <g fill="none" stroke="#d2cec4" strokeWidth="27"><path d="M-20 177Q260 115 500 155T1140 100" /><path d="M220 -10L290 380" /><path d="M660 -10L600 380" /><path d="M-10 305L1130 258" /></g>
        <g fill="none" stroke="#fffdf7" strokeWidth="22"><path d="M-20 177Q260 115 500 155T1140 100" /><path d="M220 -10L290 380" /><path d="M660 -10L600 380" /><path d="M-10 305L1130 258" /></g>
        <g fill="#777969" fontSize="12" fontFamily="Arial, sans-serif"><text x="60" y="135" transform="rotate(-9 60 135)">Rua das Flores</text><text x="395" y="126">Avenida do Jardim</text><text x="720" y="291">Rua das Acácias</text><text x="423" y="279" fill="#6e8c5d">Praça do Sol</text><text x="999" y="85" fill="#6e8c5d">Jardim</text></g>
        <path d="M170 157Q290 130 418 145T625 158L605 275L959 261L950 204" stroke="#fff" strokeWidth="13" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M170 157Q290 130 418 145T625 158L605 275L959 261L950 204" stroke="#f38114" strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M638 274L959 261L950 204" stroke="#efb546" strokeWidth="7" strokeDasharray="8 8" fill="none" />
        <g filter="url(#r2b-map-shadow)">
          <g transform="translate(170 147)"><path d="M0 17C-35-14-19-45 0-45S35-14 0 17" fill="#df0b0b" /><foreignObject x="-12" y="-37" width="24" height="24"><Store size={24} color="white" /></foreignObject></g>
          <g transform="translate(625 208)"><circle r="25" fill="#ffb900" stroke="white" strokeWidth="4" /><foreignObject x="-15" y="-15" width="30" height="30"><Bike size={30} color="#624000" /></foreignObject></g>
          <g transform="translate(950 198)"><path d="M0 17C-35-14-19-45 0-45S35-14 0 17" fill="#34986a" /><foreignObject x="-12" y="-37" width="24" height="24"><Home size={24} color="white" /></foreignObject></g>
          <g fill="white" stroke="#e3dccd"><rect x="94" y="78" width="152" height="26" rx="6" /><rect x="565" y="241" width="120" height="26" rx="6" /><rect x="876" y="125" width="148" height="26" rx="6" /></g>
        </g>
        <g fill="#413628" fontSize="13" fontWeight="bold" textAnchor="middle" fontFamily="Arial, sans-serif"><text x="170" y="96">Loja Néia Salgados</text><text x="625" y="259">Seu motoboy</text><text x="950" y="143">Seu endereço</text></g>
      </svg>
      </div>
      <figcaption><span><i className="r2b-dot-store" />Loja Néia Salgados</span><span><i className="r2b-dot-bike" />Motoboy</span><span><i className="r2b-dot-home" />Seu endereço</span><small>Mapa demonstrativo — localização fictícia</small></figcaption>
    </figure>
  );
}
