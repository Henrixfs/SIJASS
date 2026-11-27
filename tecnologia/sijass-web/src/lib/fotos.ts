/**
 * Fotos reales de Wikimedia Commons usadas como referencia visual (no muestran a ninguna JASS).
 * Cada una se publica con su autor y su licencia.
 */
export interface Foto {
  readonly url: string;
  readonly descripcion: string;
  readonly titulo: string;
  readonly autor: string;
  readonly licencia: string;
  /** Encuadre recomendado para `background-position`. */
  readonly encuadre: string;
}

const foto = (archivo: string, descripcion: string, titulo: string, autor: string, licencia: string, encuadre = 'center'): Foto => ({
  url: `/fotos/${archivo}.webp`, descripcion, titulo, autor, licencia, encuadre,
});

export const FOTOS = {
  llanganuco: foto('llanganuco', 'Laguna de Llanganuco, Áncash: agua turquesa entre paredes de roca', 'Lagunas de Llanganuco', 'PsamatheM', 'CC BY-SA 4.0'),
  laguna69: foto('laguna69', 'Laguna 69, Áncash: agua clara al pie de la montaña', 'Laguna 69', 'Renata Maria Cristina', 'CC BY-SA 4.0', 'center 62%'),
  orilla: foto('orilla', 'Orilla de la laguna Parón, Áncash', 'Laguna Parón', 'Txolo', 'CC BY-SA 4.0', 'center 64%'),
  paron: foto('paron', 'Laguna Parón con el nevado Pirámide, Áncash', 'Laguna Parón', 'Txolo', 'CC BY-SA 4.0'),
  puquio: foto('puquio', 'Puquio de los acueductos de Cantalloc, Nasca', 'Acueductos de Cantalloc', 'Diego Delso', 'CC BY-SA 4.0'),
  tinajones: foto('tinajones', 'Reservorio de Tinajones, Lambayeque', 'Reservorio de Tinajones', 'Josefito123', 'CC BY-SA 4.0', 'center 55%'),
  gocta: foto('gocta', 'Catarata de Gocta, Amazonas', 'Catarata de Gocta', 'J0EL 20001', 'CC BY-SA 4.0'),
  bofedales: foto('bofedales', 'Bofedales camino al abra de Arurayqocha', 'Subida al abra de Arurayqocha', 'C4s3r1t4', 'CC BY-SA 4.0', 'center 62%'),
  humedal: foto('humedal', 'Monitoreo de un humedal andino', 'Monitoreo de humedal andino', 'EudioEli', 'CC BY-SA 4.0', 'center 62%'),
} as const satisfies Record<string, Foto>;

export type NombreFoto = keyof typeof FOTOS;

/** Texto de crédito: «Foto referencial: título · autor · licencia». */
export function credito(f: Foto, referencial = true): string {
  return `${referencial ? 'Foto referencial' : 'Foto'}: ${f.titulo} · ${f.autor} · ${f.licencia}`;
}

/** Una foto fija para cada reservorio, elegida por su identificador (las fotos son referenciales). */
const PARA_RESERVORIOS: readonly NombreFoto[] = ['tinajones', 'puquio', 'gocta', 'bofedales', 'humedal'];
export function fotoDeReservorio(id: string): Foto {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return FOTOS[PARA_RESERVORIOS[h % PARA_RESERVORIOS.length]];
}
