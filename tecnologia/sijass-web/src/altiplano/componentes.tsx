import { useId, type CSSProperties, type ReactNode } from 'react';
import { credito, type Foto } from '../lib/fotos';
import { indiceAvatar, marcadoAvatar } from './avatares';

/** Avatar ilustrado de una persona, elegido por su identificador. Decorativo: el nombre va escrito al lado. */
export function Avatar({ id, indice, tam = 'm', insignia, className = '' }: { id?: string; indice?: number; tam?: 's' | 'm' | 'l' | 'xl'; insignia?: ReactNode; className?: string }) {
  const n = indice ?? indiceAvatar(id ?? '');
  return (
    <span className={`avatar-alt av-${tam} ${className}`} aria-hidden="true" data-avatar={n}>
      {/* El marcado sale del catálogo fijo de avatares.ts: ningún dato del usuario entra aquí. */}
      <svg className="cara" viewBox="0 0 80 80" dangerouslySetInnerHTML={{ __html: marcadoAvatar(n) }} />
      {insignia && <i>{insignia}</i>}
    </span>
  );
}

const OLA = 'M0 40Q90 4 180 40T360 40T540 40T720 40T900 40T1080 40T1260 40T1440 40V80H0Z';

/** Tres capas de olas que corren en bucle (solo `transform`; se detienen con «reducir movimiento»). */
export function Olas({ className = '' }: { className?: string }) {
  return (
    <div className={`olas ${className}`} aria-hidden="true">
      {[0, 1, 2].map((i) => <svg key={i} viewBox="0 0 1440 80" preserveAspectRatio="none"><path d={OLA} /></svg>)}
    </div>
  );
}

/** Banda con foto real, velo, olas y crédito. */
export function BandaFoto({ foto, className = '', children, referencial = true }: { foto: Foto; className?: string; children?: ReactNode; referencial?: boolean }) {
  const estilo = { '--foto': `url('${foto.url}')`, '--encuadre': foto.encuadre } as CSSProperties;
  return (
    <section className={`banda-foto ${className}`} style={estilo}>
      <div className="banda-img" role="img" aria-label={foto.descripcion} />
      <div className="banda-velo" aria-hidden="true" />
      <div className="banda-contenido">{children}</div>
      <span className="credito-foto">{credito(foto, referencial)}</span>
      <Olas />
    </section>
  );
}

/** Gota con su contorno y un nivel de agua (0 a 1): pagado, parcial o pendiente. */
export function GotaNivel({ nivel, etiqueta, marca }: { nivel: number; etiqueta: string; marca: string }) {
  const forma = 'M19 2C19 2 3 20 3 29a16 16 0 0 0 32 0C35 20 19 2 19 2z';
  const clase = nivel >= 1 ? 'pag' : nivel > 0 ? 'parc' : 'pend';
  const id = `gota${useId().replace(/:/g, '')}`;
  return (
    <span className={`gota-nivel ${clase}`}>
      <svg viewBox="0 0 38 46" role="img" aria-label={etiqueta}>
        <defs><clipPath id={id}><path d={forma} /></clipPath></defs>
        <path className="contorno" d={forma} />
        <g clipPath={`url(#${id})`}><rect className="relleno" width="38" height="46" style={{ transform: `translateY(${(1 - Math.min(1, Math.max(0, nivel))) * 100}%)` }} /></g>
        <text className="marca-g" x="19" y="34">{marca}</text>
      </svg>
    </span>
  );
}
