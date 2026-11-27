/**
 * Avatares ilustrados propios (SVG). Cada persona recibe uno por su identificador; nunca se deduce
 * nada del nombre. El marcado sale solo de este catálogo fijo: ningún dato del usuario entra al SVG.
 */
type Piel = 'clara' | 'miel' | 'trigo' | 'canela';
type Pelo = 'negro' | 'castano' | 'gris' | 'cobrizo';
type Fondo = 'agua' | 'sol' | 'coral' | 'cielo' | 'lila' | 'hoja' | 'rosa' | 'noche';
type Peinado = 'corto' | 'lado' | 'largo' | 'trenzas' | 'mono' | 'rizado';
type Gorro = 'sombrero' | 'chullo' | 'gorra';

interface Rasgos {
  fondo: Fondo; piel: Piel; peinado: Peinado; pelo?: Pelo; gorro?: Gorro; colorGorro?: string; detalle?: string;
  ropa: string; traje?: 'chaleco' | 'manta'; aretes?: boolean; lentes?: boolean; bigote?: boolean;
}

const PIEL: Record<Piel, [string, string]> = { clara: ['#F3C9A5', '#D9A37E'], miel: ['#DFA579', '#C0845A'], trigo: ['#C98B60', '#A96D45'], canela: ['#A86C47', '#8A5233'] };
const PELO: Record<Pelo, string> = { negro: '#201A1D', castano: '#4A2E22', gris: '#B9BFC4', cobrizo: '#6E3B24' };
const FONDO: Record<Fondo, [string, string]> = {
  agua: ['#1FA9A0', '#7FE7D4'], sol: ['#F2A93B', '#FFDB8C'], coral: ['#EC7A5C', '#FFBFA6'], cielo: ['#3E8FE0', '#A6D2FF'],
  lila: ['#7D6BCB', '#C7BBF6'], hoja: ['#3F9E6A', '#AEE2BC'], rosa: ['#D9618F', '#F8BCD3'], noche: ['#135A6B', '#4FC3C9'],
};
const CABEZA = 'M23.5 33c0-13 7.4-19.5 16.5-19.5S56.5 20 56.5 33v3c0 12-7.4 20-16.5 20S23.5 48 23.5 36z';
const FRENTE_RAYA = 'M23.2 34C23 19.5 31 12.8 40 12.8S57 19.5 56.8 34c-7.8-.8-13.8-5.4-16.8-11.6C37 28.6 31 33.2 23.2 34z';

const trenza = (x: number, color: string, lazo: string) => [40, 46.5, 53, 59.5, 65.5]
  .map((y, i) => `<ellipse cx="${x + (i % 2 ? 1.2 : -1.2)}" cy="${y}" rx="${4.9 - i * 0.25}" ry="4.5" fill="${color}"/>`).join('')
  + `<rect x="${x - 4}" y="68.5" width="8" height="3.6" rx="1.8" fill="${lazo}"/><path d="M${x - 3} 72h6l-1.5 6h-3z" fill="${color}"/>`;

type Capa = ((c: string, d: string) => string) | null;
const PEINADO: Record<Peinado, [Capa, (c: string, d: string) => string]> = {
  corto: [null, (c) => `<path fill="${c}" d="M22.5 36c-2.5-17 6-26 18.5-26 11 0 19 7.5 16.5 25-1.5-5-2.5-8.5-4.5-11.5-7 3.5-17 4.5-25 2.5-2.5 2.5-4 6-5.5 10z"/>`],
  lado: [null, (c) => `<path fill="${c}" d="M22.8 37C20 19 29 10.5 40.5 10.5c12 0 19.5 8 17 25-1-4-2.4-7.2-4-9-6-1-12-4.5-14.5-8.5-2.5 5-8.5 9.5-14 10.5-1 2.5-1.7 5.2-2.2 8.5z"/>`],
  largo: [(c) => `<path fill="${c}" d="M19 40C17 18 28 8.5 40 8.5S63 18 61 40c-.8 9 1.5 18 5 24-8 3-14 2-17-1H31c-3 3-9 4-17 1 3.5-6 5.8-15 5-24z"/>`,
    (c) => `<path fill="${c}" d="M23.5 34C23 20 30.5 13 40 13c9 0 16.8 6.5 16.5 21-8-1-15.5-6.5-18-12-2.5 5.5-8 10-15 12z"/>`],
  trenzas: [(c) => `<path fill="${c}" d="M21 38C19 18 29 10 40 10s21 8 19 28l-3 8H24z"/>`, (c, d) => `<path fill="${c}" d="${FRENTE_RAYA}"/>${trenza(21.5, c, d)}${trenza(58.5, c, d)}`],
  mono: [(c) => `<ellipse cx="40" cy="10.5" rx="9.5" ry="8" fill="${c}"/><path fill="${c}" d="M22 38C20 20 29 12 40 12s20 8 18 26z"/>`, (c) => `<path fill="${c}" d="${FRENTE_RAYA}"/>`],
  rizado: [(c) => [[23, 30, 8], [25, 20, 8.5], [33, 13.5, 9], [43, 12, 9], [52, 16, 8.5], [57, 25, 8], [58, 35, 6.5], [22, 39, 6.5]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`).join(''),
    (c) => [[29, 21, 5.5], [36, 18, 5.8], [44, 18, 5.8], [51, 21.5, 5.2]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`).join('')],
};

const GORRO: Record<Gorro, (c: string, d: string) => string> = {
  sombrero: (c, d) => `<path fill="${c}" d="M28 21.5c0-10.5 4-15.5 12-15.5s12 5 12 15.5z"/><path fill="${d}" d="M28.2 16.5h23.6l.2 4.8H28z"/><ellipse cx="40" cy="22" rx="25" ry="4.6" fill="${c}"/>`,
  chullo: (c, d) => `<path fill="${c}" d="M22.5 30C22 13 30 6.5 40 6.5S58 13 57.5 30c-6-3.5-11.5-5-17.5-5s-11.5 1.5-17.5 5z"/><path d="M25.5 21l3.6-3.4 3.6 3.4 3.6-3.4 3.7 3.4 3.7-3.4 3.6 3.4 3.6-3.4 3.6 3.4" stroke="${d}" stroke-width="2.2" fill="none" stroke-linejoin="round"/><path fill="${c}" d="M22.6 28c-2 9-1.4 15 1.8 18.5 3-2.5 4.2-8.5 3.6-18zM57.4 28c2 9 1.4 15-1.8 18.5-3-2.5-4.2-8.5-3.6-18z"/><path d="M24.4 46v10M55.6 46v10" stroke="${d}" stroke-width="1.8"/><circle cx="40" cy="6.5" r="3.8" fill="${d}"/>`,
  gorra: (c, d) => `<path fill="${c}" d="M23.5 28c0-12.5 7.3-18.5 16.5-18.5S56.5 15.5 56.5 28z"/><path fill="${d}" d="M21.5 27.5h31c6.5 0 10.5 1.3 11.5 4-10-1.7-28-2.5-42.5-.6z"/>`,
};

function dibujo(a: Rasgos): string {
  const [piel, sombra] = PIEL[a.piel];
  const pelo = PELO[a.pelo ?? 'negro'];
  const [f1, f2] = FONDO[a.fondo];
  const [atras, delante] = PEINADO[a.peinado];
  const det = a.detalle ?? '#FFD36B';
  let torso = `<path fill="${a.ropa}" d="M10 80c1.5-14.5 13-22.5 30-22.5S68.5 65.5 70 80z"/>`;
  if (a.traje === 'chaleco') torso += '<path d="M27 61.5V80M53 61.5V80" stroke="#FFF2A8" stroke-width="4.5"/><path d="M14 74h52" stroke="#FFF2A8" stroke-width="2.5" opacity=".8"/>';
  if (a.traje === 'manta') torso += `<path d="M16 68c8 4.5 15 7.5 24 12 9-4.5 16-7.5 24-12" stroke="${det}" stroke-width="3.2" fill="none"/><path d="M40 63.5l3.4 3.6-3.4 3.6-3.4-3.6z" fill="${det}"/>`;
  const cuello = a.traje === 'manta' ? '' : `<path fill="${a.traje === 'chaleco' ? '#2B4752' : '#FFFFFF'}" opacity=".92" d="M32.5 58.5l7.5 9 7.5-9-3-1.3-4.5 4.6-4.5-4.6z"/>`;
  return `<rect width="80" height="80" fill="${f1}"/><path d="M0 58q10-8 20 0t20 0 20 0 20 0v22H0z" fill="${f2}" opacity=".55"/><path d="M0 67q10-7 20 0t20 0 20 0 20 0v13H0z" fill="${f2}" opacity=".45"/>`
    + (atras ? atras(pelo, det) : '') + torso
    + `<path fill="${sombra}" d="M34 49h12v10c0 3-2.7 5-6 5s-6-2-6-5z"/>` + cuello
    + `<ellipse cx="23.5" cy="37.5" rx="3.2" ry="4.3" fill="${piel}"/><ellipse cx="56.5" cy="37.5" rx="3.2" ry="4.3" fill="${piel}"/><path fill="${piel}" d="${CABEZA}"/>`
    + `<path d="M29.5 31.8q3.5-2.3 7-.2M43.5 31.6q3.5-2.1 7 .2" stroke="${a.pelo === 'gris' ? '#8B9297' : pelo}" stroke-width="1.7" fill="none" stroke-linecap="round"/>`
    + '<g class="ojos"><ellipse cx="33" cy="37" rx="2.1" ry="2.6" fill="#1C1417"/><ellipse cx="47" cy="37" rx="2.1" ry="2.6" fill="#1C1417"/><circle cx="33.7" cy="36" r=".75" fill="#fff"/><circle cx="47.7" cy="36" r=".75" fill="#fff"/></g>'
    + `<path d="M40.2 39q-1.9 4.6 1 5.1" stroke="${sombra}" stroke-width="1.4" fill="none" stroke-linecap="round"/><ellipse cx="29.5" cy="44" rx="3.2" ry="2" fill="#E4604C" opacity=".32"/><ellipse cx="50.5" cy="44" rx="3.2" ry="2" fill="#E4604C" opacity=".32"/>`
    + '<path d="M34.8 47.2q5.2 4.8 10.4 0" stroke="#8C3328" stroke-width="2" fill="none" stroke-linecap="round"/>'
    + (a.bigote ? `<path fill="${pelo}" d="M33 46c2.7-2.7 5-1.6 7-.5 2-1.1 4.3-2.2 7 .5-2.8 1.7-5 1.5-7 .4-2 1.1-4.2 1.3-7-.4z"/>` : '')
    + delante(pelo, det)
    + (a.aretes ? `<circle cx="23.2" cy="43.5" r="1.8" fill="${det}"/><circle cx="56.8" cy="43.5" r="1.8" fill="${det}"/>` : '')
    + (a.lentes ? '<g fill="#ffffff22" stroke="#22343C" stroke-width="1.6"><rect x="27" y="32.5" width="11.5" height="9" rx="3.6"/><rect x="41.5" y="32.5" width="11.5" height="9" rx="3.6"/><path d="M38.5 36h3" fill="none"/></g>' : '')
    + (a.gorro ? GORRO[a.gorro](a.colorGorro ?? '#7A4B2A', det) : '');
}

const CATALOGO: readonly Rasgos[] = [
  { fondo: 'agua', piel: 'miel', peinado: 'trenzas', gorro: 'sombrero', colorGorro: '#F4E7CC', detalle: '#D9467A', ropa: '#B8336A', traje: 'manta', aretes: true },
  { fondo: 'sol', piel: 'trigo', peinado: 'corto', gorro: 'chullo', colorGorro: '#9E3B2E', detalle: '#FFE08A', ropa: '#245C7A', bigote: true },
  { fondo: 'coral', piel: 'clara', peinado: 'largo', pelo: 'castano', ropa: '#5C4AA8', traje: 'manta', detalle: '#7FE7D4', aretes: true },
  { fondo: 'noche', piel: 'miel', peinado: 'mono', ropa: '#F4EFE4', detalle: '#F2A93B', lentes: true, aretes: true },
  { fondo: 'cielo', piel: 'clara', peinado: 'lado', pelo: 'castano', ropa: '#14394B', lentes: true },
  { fondo: 'hoja', piel: 'trigo', peinado: 'trenzas', gorro: 'gorra', colorGorro: '#14606B', detalle: '#FFD36B', ropa: '#F07A2B', traje: 'chaleco' },
  { fondo: 'agua', piel: 'canela', peinado: 'corto', gorro: 'gorra', colorGorro: '#243C4A', detalle: '#6FE3D0', ropa: '#F07A2B', traje: 'chaleco', bigote: true },
  { fondo: 'lila', piel: 'miel', peinado: 'rizado', ropa: '#1F7A6F', aretes: true },
  { fondo: 'rosa', piel: 'trigo', peinado: 'mono', pelo: 'gris', ropa: '#7A2E52', traje: 'manta', lentes: true },
  { fondo: 'hoja', piel: 'miel', peinado: 'corto', pelo: 'gris', gorro: 'sombrero', colorGorro: '#6B4A2F', detalle: '#E9A23B', ropa: '#8A3B2A', bigote: true },
  { fondo: 'cielo', piel: 'canela', peinado: 'largo', gorro: 'sombrero', colorGorro: '#2F2A33', detalle: '#EC7A5C', ropa: '#C7522F', traje: 'manta' },
  { fondo: 'sol', piel: 'clara', peinado: 'rizado', pelo: 'cobrizo', ropa: '#2E6A8E' },
  { fondo: 'coral', piel: 'trigo', peinado: 'lado', ropa: '#1F5E4B' },
  { fondo: 'lila', piel: 'canela', peinado: 'corto', gorro: 'chullo', colorGorro: '#1F6F78', detalle: '#FFC857', ropa: '#4A2F6E' },
  { fondo: 'noche', piel: 'clara', peinado: 'trenzas', pelo: 'castano', ropa: '#E9A23B', detalle: '#6FE3D0', traje: 'manta' },
  { fondo: 'rosa', piel: 'miel', peinado: 'corto', ropa: '#30475A', lentes: true },
];

export const CANTIDAD_AVATARES = CATALOGO.length;

/** Índice estable del avatar para un identificador (FNV-1a de 32 bits). */
export function indiceAvatar(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % CATALOGO.length;
}

const cache = new Map<number, string>();
/** Marcado interno del SVG (sin la etiqueta `<svg>`) del avatar número `indice`. */
export function marcadoAvatar(indice: number): string {
  const i = ((indice % CATALOGO.length) + CATALOGO.length) % CATALOGO.length;
  let m = cache.get(i);
  if (m === undefined) {
    m = dibujo(CATALOGO[i]);
    cache.set(i, m);
  }
  return m;
}
