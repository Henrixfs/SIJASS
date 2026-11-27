/**
 * Fotos mínimas para las pruebas: tienen la estructura de JPEG y PNG (firma, segmentos y fragmentos)
 * con metadatos que el sistema debe quitar. No son imágenes decodificables y no hace falta.
 */
const segmento = (marcador: number, datos: Buffer) => {
  const cabecera = Buffer.alloc(4);
  cabecera[0] = 0xff;
  cabecera[1] = marcador;
  cabecera.writeUInt16BE(datos.length + 2, 2);
  return Buffer.concat([cabecera, datos]);
};

export const MARCA_EXIF = 'GPS-de-la-casa';
export const MARCA_TEXTO_PNG = 'Autor-secreto';

/** JPEG con APP0 (JFIF) y APP1 (EXIF con una marca de ubicación) antes de la imagen. */
export function jpegConExif(relleno = 'imagen'): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    segmento(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1')),
    segmento(0xe1, Buffer.from(`Exif\0\0${MARCA_EXIF}`, 'latin1')),
    segmento(0xdb, Buffer.alloc(65, 1)),
    Buffer.from([0xff, 0xda, 0x00, 0x08, 1, 1, 0, 0, 0x3f, 0]),
    Buffer.from(relleno, 'latin1'),
    Buffer.from([0xff, 0xd9]),
  ]);
}

const fragmento = (tipo: string, datos: Buffer) => {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  return Buffer.concat([largo, Buffer.from(tipo, 'latin1'), datos, Buffer.alloc(4)]);
};

/** PNG con IHDR, un fragmento tEXt y otro eXIf (metadatos) y sus datos de imagen. */
export function pngConTexto(): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    fragmento('IHDR', Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0])),
    fragmento('tEXt', Buffer.from(`Author\0${MARCA_TEXTO_PNG}`, 'latin1')),
    fragmento('eXIf', Buffer.from(MARCA_EXIF, 'latin1')),
    fragmento('IDAT', Buffer.from([1, 2, 3, 4])),
    fragmento('IEND', Buffer.alloc(0)),
  ]);
}
