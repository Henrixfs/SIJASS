/**
 * Iconos de la maqueta v3 (trazos de 24 px; la mayoría son de Lucide, ISC). El marcado es fijo:
 * ningún dato de la persona entra aquí.
 */
const TRAZOS = {
  'gota': '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
  'persona': '<path d="M12 11.6a4.6 4.6 0 1 0 0-9.2 4.6 4.6 0 0 0 0 9.2Z"/><path d="M3.6 20.1c0-4 3.8-6.5 8.4-6.5s8.4 2.5 8.4 6.500c0 .9-.7 1.6-1.6 1.600H5.200c-.9 0-1.6-.7-1.6-1.600Z"/>',
  'users': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  'wallet': '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  'flask': '<path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/>',
  'grid': '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  'shield': '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.810 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  'flecha': '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  'check': '<path d="M20 6 9 17l-5-5"/>',
  'home': '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  'recibo': '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.500v-11"/>',
  'mas': '<path d="M5 12h14"/><path d="M12 5v14"/>',
  'llave': '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
  'candado': '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  'pausa': '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  'reanudar': '<path d="m6 3 14 9-14 9z"/>',
  'pin': '<path d="M12 17v5"/><path d="M9 10.760a2 2 0 0 1-1.110 1.790l-1.780.9A2 2 0 0 0 5 15.240V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.760a2 2 0 0 0-1.110-1.790l-1.780-.9A2 2 0 0 1 15 10.760V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
  'equis': '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  'lugar': '<path d="M20 10c0 5-5.540 10.190-7.4 11.800a1 1 0 0 1-1.2 0C9.540 20.190 4 15 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  'salir': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  'equipo': '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
  'megafono': '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  'libro': '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/><path d="M8 7h8M8 11h6"/>',
  'lupa': '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  'camara': '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  'volver': '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
  'revertir': '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  'reloj': '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  'ojo': '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  'empezar': '<path d="m6 3 14 9-14 9z"/>',
  'c-fuga': '<path d="M3 4v10"/><path d="M3 7h9a3 3 0 0 1 3 3v1"/><path d="M13 11h4"/><path d="M15 21.5a2.8 2.8 0 0 0 2.8-2.8c0-1.9-2.8-4.7-2.8-4.7s-2.8 2.8-2.8 4.7a2.8 2.8 0 0 0 2.8 2.8z"/>',
  'c-corte': '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/><path d="M3 3l18 18"/>',
  'c-turbia': '<path d="M6 3h12l-1.4 16.2a2 2 0 0 1-2 1.8H9.4a2 2 0 0 1-2-1.8z"/><path d="M6.7 10c1.8-1.5 3.5 1.2 5.3 0s3.5-1.5 5.3 0"/><path d="M10 14.5h.01M14 16h.01M10.5 18h.01"/>',
  'c-presion': '<path d="m12 15 3.5-4.5"/><path d="M3.3 19a10 10 0 1 1 17.4 0"/><path d="M12 15h.01"/>',
  'c-averia': '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  'c-otro': '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 8h8M8 12h5"/>',
  'a-casa': '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M10 21v-6h4v6"/>',
  'a-casas': '<path d="M2 12 7.5 7.5 13 12v8H2z"/><path d="M11 8.5 16.5 4 22 8.5V20h-9"/>',
  'a-zona': '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>',
  'a-nose': '<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
} as const;

export type NombreIcono = keyof typeof TRAZOS;

export function Ic({ n, className = '', lleno = false }: { n: NombreIcono; className?: string; lleno?: boolean }) {
  return <svg className={`ic ${lleno ? 'lleno-ic' : ''} ${className}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: TRAZOS[n] }} />;
}
