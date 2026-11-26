/**
 * Preferencia del panel lateral del personal (plegado o desplegado), recordada en este navegador.
 * Es una comodidad por persona: si el almacenamiento no está disponible (ventana privada, datos del
 * sitio bloqueados) el panel funciona igual y abre desplegado.
 */
const CLAVE = 'sijass.panel-plegado';

export function leerPanelPlegado(): boolean {
  try {
    return window.localStorage.getItem(CLAVE) === '1';
  } catch {
    return false;
  }
}

export function guardarPanelPlegado(plegado: boolean): void {
  try {
    if (plegado) window.localStorage.setItem(CLAVE, '1');
    else window.localStorage.removeItem(CLAVE);
  } catch {
    // Sin almacenamiento: la preferencia vale solo para esta visita.
  }
}
