import { useCallback, useState } from 'react';
import { useApp } from '../contexto';
import { useCarga } from '../hooks';
import { Carga, ErrorConsulta, Insignia, SinPermiso } from '../ui';
import { ROL_NOMBRE, seccionesPersonal } from '../lib/personal';
import { IconoModulo } from '../identidad';
import { Boton } from '../ui';
import { CambiarClave } from './CambiarClave';

export function Perfil() {
  const { api, sesion, navegar } = useApp();
  const cargar = useCallback(() => api.solicitar<{ perfil: string; rol: string | null }>('GET', '/v1/yo'), [api]);
  const { datos, error, prohibido, cargando, recargar } = useCarga(cargar);
  const [cambiando, setCambiando] = useState(false);
  const rol = datos?.rol ?? '';
  const coincide = datos?.perfil === 'personal' && rol === sesion?.rol && Object.hasOwn(ROL_NOMBRE, rol);
  const anterior: unknown = window.history.state?.retorno;
  const retorno = typeof anterior === 'string' && /^\/personal(?:\/(?!perfil$)[\w/-]+)?$/.test(anterior) ? anterior : '/personal/inicio';

  return (
    <section>
      <a href={retorno} onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        navegar(retorno);
      }}>← Volver</a>
      <h1>Mi perfil</h1>
      {cargando && <Carga />}
      {error && <ErrorConsulta error={error} recargar={recargar} />}
      {(prohibido || (datos && !coincide)) && <SinPermiso />}
      {coincide && (
        <div className="tarjeta">
          <h2>Información de sesión</h2>
          <dl className="ficha">
            <div><dt>Nombre</dt><dd data-testid="perfil-nombre">{sesion?.nombre}</dd></div>
            <div><dt>DNI</dt><dd data-testid="perfil-documento">{sesion?.documento}</dd></div>
            <div><dt>JASS</dt><dd>{sesion?.jass?.nombre}</dd></div>
            <div><dt>Perfil</dt><dd>Personal de la JASS</dd></div>
            <div><dt>Rol</dt><dd><Insignia tipo="info">{ROL_NOMBRE[rol]}</Insignia></dd></div>
          </dl>
          <div><Boton onClick={() => setCambiando(true)}>Cambiar mi clave</Boton></div>
          {cambiando && <CambiarClave cerrar={() => setCambiando(false)} />}
          <h2>Módulos de su rol</h2>
          <ul className="permisos-perfil">{seccionesPersonal.filter((s) => s.id !== 'perfil' && s.id !== 'inicio' && s.roles.includes(rol)).map((s) => <li key={s.id}><IconoModulo id={s.id} />{s.nombre}</li>)}</ul>
        </div>
      )}
    </section>
  );
}
