import { lazy, Suspense } from 'react';
import { useApp } from '../contexto';
import { SinPermiso } from '../ui';
import { Cargando } from '../v3/base';
import { EnlacePersonal, MarcoPersonal } from './NavegacionPersonal';
import { Resumen } from './Resumen';
import { Equipo } from './Equipo';
import { ALIAS_SECCION, seccionesPersonal } from '../lib/personal';
import { Perfil } from './Perfil';
import { Asociados } from './Asociados';
import { CuotasYPagos } from './CuotasYPagos';
import { Reportes } from './Reportes';
import { Agua } from './Agua';

const Asistente = lazy(() => import('./Asistente').then((modulo) => ({ default: modulo.Asistente })));

export function Personal({ ruta }: { ruta: string }) {
  const { sesion } = useApp();
  const rol = sesion?.rol ?? '';
  const cuenta = /^\/personal\/(asociados|cuotas)\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i.exec(ruta);
  const pedida = ruta === '/personal' || ruta === '/personal/' ? 'inicio' : cuenta?.[1] ?? ruta.slice('/personal/'.length);
  const seccion = ALIAS_SECCION[pedida] ?? pedida;
  const modulo = seccionesPersonal.find((s) => s.id === seccion);
  let contenido;

  if (!modulo) contenido = <section className="titulo-v"><h1>Página no encontrada</h1><EnlacePersonal id="inicio" className="bt borde">Volver al inicio</EnlacePersonal></section>;
  else if (!modulo.roles.includes(rol)) contenido = <SinPermiso />;
  else {
    switch (seccion) {
      case 'inicio': contenido = <Resumen rol={rol} />; break;
      case 'perfil': contenido = <Perfil />; break;
      case 'asociados': contenido = <Asociados cuentaId={cuenta?.[2] ?? null} />; break;
      case 'equipo': contenido = <Equipo />; break;
      case 'cuotas': contenido = <CuotasYPagos cuentaId={cuenta?.[2] ?? null} />; break;
      case 'agua': contenido = <Agua rol={rol} />; break;
      case 'asistente': contenido = <Asistente />; break;
      case 'reportes': contenido = <Reportes rol={rol} />; break;
      default: contenido = <SinPermiso />;
    }
  }

  return <MarcoPersonal ruta={ruta} seccion={seccion} rol={rol}><Suspense fallback={<Cargando />}>{contenido}</Suspense></MarcoPersonal>;
}
