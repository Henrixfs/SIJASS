import { lazy, Suspense } from 'react';
import { useApp } from '../contexto';
import { Carga, SinPermiso } from '../ui';
import { EnlacePersonal, MarcoPersonal } from './NavegacionPersonal';
import { Resumen } from './Resumen';
import { Equipo } from './Equipo';
import { seccionesPersonal } from '../lib/personal';
import { Perfil } from './Perfil';
import { Asociados } from './Asociados';
import { CuotasYPagos } from './CuotasYPagos';
import { CuentaAsociado } from './CuentaAsociado';

const Asistente = lazy(() => import('./Asistente').then((modulo) => ({ default: modulo.Asistente })));
const Mediciones = lazy(() => import('./Mediciones').then((modulo) => ({ default: modulo.Mediciones })));

export function Personal({ ruta }: { ruta: string }) {
  const { sesion, navegar } = useApp();
  const rol = sesion?.rol ?? '';
  const cuenta = /^\/personal\/(asociados|cuotas)\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i.exec(ruta);
  const seccionInicial = rol === 'operador' ? 'mediciones' : 'asociados';
  const seccion = ruta === '/personal' ? seccionInicial : cuenta?.[1] ?? ruta.slice('/personal/'.length);
  const modulo = seccionesPersonal.find((s) => s.id === seccion);
  let contenido;

  if (!modulo) contenido = <section><h1>Página no encontrada</h1><EnlacePersonal id="inicio">Volver al inicio</EnlacePersonal></section>;
  else if (!modulo.roles.includes(rol)) contenido = <SinPermiso />;
  else if (cuenta) contenido = <CuentaAsociado
    key={cuenta[2]}
    id={cuenta[2]}
    volver={() => navegar(`/personal/${seccion}`)}
    etiquetaVolver={seccion === 'cuotas' ? 'Volver a cuotas y pagos' : 'Volver al padrón'}
  />;
  else {
    switch (seccion) {
      case 'inicio': contenido = <Resumen rol={rol} />; break;
      case 'perfil': contenido = <Perfil />; break;
      case 'asociados': contenido = <Asociados />; break;
      case 'equipo': contenido = <Equipo />; break;
      case 'cuotas': contenido = <CuotasYPagos />; break;
      case 'reservorios': contenido = <Mediciones key={seccion} modo="reservorios" />; break;
      case 'campo': contenido = <Mediciones key={seccion} modo="campo" />; break;
      case 'asistente': contenido = <Asistente />; break;
      default: contenido = <Mediciones key={seccion} />;
    }
  }

  return <MarcoPersonal ruta={ruta} seccion={seccion} rol={rol}><Suspense fallback={<Carga />}>{contenido}</Suspense></MarcoPersonal>;
}
