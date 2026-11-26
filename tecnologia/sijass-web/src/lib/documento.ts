/** Deja solo los dígitos: el DNI se escribe con el teclado numérico y no admite espacios ni letras. */
export function soloDigitos(texto: string): string {
  return texto.replace(/\D/g, '');
}

/** Un DNI tiene exactamente 8 dígitos. */
export function dniValido(texto: string): boolean {
  return /^[0-9]{8}$/.test(texto);
}
