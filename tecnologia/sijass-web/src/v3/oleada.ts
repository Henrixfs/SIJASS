/**
 * La oleada de la maqueta: el agua sube, cubre la pantalla y al subir del todo descubre el sistema.
 * Solo al entrar (momento poco frecuente). Con «reducir movimiento», o sin animaciones del
 * navegador, se cambia de pantalla al instante.
 */
const OLA = 'M0 40Q90 4 180 40T360 40T540 40T720 40T900 40T1080 40T1260 40T1440 40V80H0Z';
const GOTA = 'M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z';

let enCurso = false;

export function oleada(alCubrir: () => void = () => undefined): void {
  const reducir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reducir || enCurso || typeof document.body.animate !== 'function') {
    alCubrir();
    return;
  }
  enCurso = true;
  const capa = document.createElement('div');
  capa.className = 'oleada-v3';
  capa.setAttribute('aria-hidden', 'true');
  const olas = `<svg viewBox="0 0 1440 80" preserveAspectRatio="none"><path d="${OLA}"/></svg>`.repeat(3);
  capa.innerHTML = `<div class="olas sup">${olas}</div><div class="masa"></div><div class="olas inf">${olas}</div><div class="centro"><span class="gota"><svg viewBox="0 0 24 24"><path d="${GOTA}"/></svg></span></div>`;
  document.body.append(capa);
  const alto = window.innerHeight;
  // La pantalla cambia una sola vez, aunque una animación termine o se cancele después.
  let cubierto = false;
  const cubrir = () => { if (!cubierto) { cubierto = true; alCubrir(); } };
  const sube = capa.animate([{ transform: `translateY(${alto}px)` }, { transform: 'translateY(-80px)' }], { duration: 520, easing: 'cubic-bezier(.6,0,.35,1)', fill: 'forwards' });
  const terminar = () => {
    sube.onfinish = null;
    sube.oncancel = null;
    capa.remove();
    enCurso = false;
  };
  sube.onfinish = () => {
    cubrir();
    const sigue = capa.animate([{ transform: 'translateY(-80px)' }, { transform: `translateY(-${alto + 160}px)` }], { duration: 640, delay: 160, easing: 'cubic-bezier(.45,0,.2,1)', fill: 'forwards' });
    sigue.onfinish = terminar;
    sigue.oncancel = terminar;
  };
  sube.oncancel = () => { cubrir(); terminar(); };
}
