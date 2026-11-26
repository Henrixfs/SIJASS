import { formatearInstante } from '../lib/medicion';

interface Lectura {
  id: string;
  valor: number;
  tomadaEn: string;
  unidad: string;
  estado: string;
}

export function SerieLecturas({ lecturas }: { lecturas: Lectura[] }) {
  const vigentes = lecturas.filter(l => l.estado === 'vigente' && Number.isFinite(l.valor) && l.valor >= 0);
  const unidad = vigentes[0]?.unidad;
  const muestra = vigentes.filter(l => l.unidad === unidad)
    .sort((a, b) => Date.parse(a.tomadaEn) - Date.parse(b.tomadaEn)).slice(-8);
  if (muestra.length < 2) return null;
  const maximo = Math.max(...muestra.map(l => l.valor), 0.001);
  return <figure className="serie-lecturas">
    <figcaption><strong>Lecturas vigentes</strong><span>{muestra.length} tomas · {unidad}</span></figcaption>
    <div className="escala-serie">Máximo de la muestra · {Math.max(...muestra.map(l => l.valor)).toLocaleString('es-PE')} {unidad}</div>
    <div className="barras-lecturas" aria-hidden="true">
      {muestra.map(l => <span key={l.id} style={{ height: (l.valor / maximo * 100) + '%' }} title={formatearInstante(l.tomadaEn) + ' · ' + l.valor + ' ' + unidad} />)}
    </div>
    <div className="extremos-serie"><span>{formatearInstante(muestra[0].tomadaEn)}</span><span>{formatearInstante(muestra[muestra.length - 1].tomadaEn)}</span></div>
  </figure>;
}
