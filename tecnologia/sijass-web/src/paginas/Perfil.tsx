import { useCallback, useState } from 'react';
import { useApp } from '../contexto';
import { useCarga } from '../hooks';
import { SinPermiso } from '../ui';
import { ROL_NOMBRE, nombreSeccion, seccionesPersonal } from '../lib/personal';
import { Av, Bt, Cargando, FalloCarga, Ic, Olas, ROL_V3 } from '../v3/base';
import { createPortal } from 'react-dom';
import { CambiarClave } from './CambiarClave';
import { TituloVista } from './NavegacionPersonal';

/** Mi perfil (personal): quién soy, mi rol y lo que puedo hacer; desde aquí se cambia la clave. */
export function Perfil() {
  const { api, sesion, navegar } = useApp();
  const cargar = useCallback(() => api.solicitar<{ perfil: string; rol: string | null }>('GET', '/v1/yo'), [api]);
  const { datos, error, prohibido, recargar } = useCarga(cargar);
  const [cambiando, setCambiando] = useState(false);
  const rol = datos?.rol ?? '';
  const coincide = datos?.perfil === 'personal' && rol === sesion?.rol && Object.hasOwn(ROL_NOMBRE, rol);
  const anterior: unknown = window.history.state?.retorno;
  const retorno = typeof anterior === 'string' && /^\/personal(?:\/(?!perfil$)[\w/-]+)?$/.test(anterior) ? anterior : '/personal/inicio';
  const v3 = ROL_V3[rol] ?? ROL_V3.consejo;

  return (
    <>
      <TituloVista titulo="Mi perfil" sub="Tu cuenta en el panel de la JASS"
        acciones={<a className="bt borde" href={retorno} onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
          e.preventDefault();
          navegar(retorno);
        }}><Ic n="volver" />Volver</a>} />
      {!datos && !error && <Cargando />}
      {error && <FalloCarga texto={error} recargar={() => void recargar()} />}
      {(prohibido || (datos && !coincide)) && <SinPermiso />}
      {coincide && (
        <section className="tarj perfil-v3" aria-labelledby="titulo-sesion">
          <div className="cuenta-cab"><Av indice={v3.avatar} tam="xl" insignia={v3.insignia} /><div><small>{sesion?.jass?.nombre}</small><b>{sesion?.nombre}</b></div></div>
          <h2 id="titulo-sesion" className="etq">Información de sesión</h2>
          <dl>
            <div><dt>Nombre</dt><dd data-testid="perfil-nombre">{sesion?.nombre}</dd></div>
            <div><dt>DNI</dt><dd data-testid="perfil-documento">{sesion?.documento}</dd></div>
            <div><dt>JASS</dt><dd>{sesion?.jass?.nombre}</dd></div>
            <div><dt>Rol</dt><dd><span className="chip ok">{ROL_NOMBRE[rol]}</span></dd></div>
          </dl>
          <Bt clase="borde" ic="candado" onClick={() => setCambiando(true)}>Cambiar mi clave</Bt>
          {cambiando && createPortal(<CambiarClave cerrar={() => setCambiando(false)} />, document.body)}
          <h2 className="etq" style={{ marginTop: 20 }}>Módulos de tu rol</h2>
          <div className="permisos">{seccionesPersonal.filter((s) => s.enMenu && s.roles.includes(rol)).map((s) => <span key={s.id} className="chip gris"><Ic n={s.icono} />{nombreSeccion(s, rol)}</span>)}</div>
          <Olas />
        </section>
      )}
    </>
  );
}
