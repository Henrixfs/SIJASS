import { useCallback, useState } from 'react';
import { ErrorApi } from '../api/cliente';
import type { AccesoEntregado } from '../api/tipos';
import { mensajeDeError, useApp } from '../contexto';
import { useCarga, useEnvio } from '../hooks';
import { dniValido, soloDigitos } from '../lib/documento';
import { FOTOS } from '../lib/fotos';
import { SinPermiso } from '../ui';
import { Av, avatarDePersonal, ordenEnRol, Banda, Bt, Cajon, Campo, Cargando, ClaveV3, Elegibles, FalloCarga, Final, Olas, ROL_V3, Tapa, useAvisar } from '../v3/base';
import { TituloVista } from './NavegacionPersonal';

interface FilaEquipo {
  usuarioId: string;
  nombre: string;
  /** Enmascarado: solo los 3 últimos dígitos. */
  documento: string;
  rol: 'consejo' | 'tesorero' | 'operador';
  estado: 'activo' | 'inactivo';
}

type Tapado = { id: string; paso: 'clave?' | 'desactivar?' } | { id: string; paso: 'clave'; clave: string };

/** Equipo de la JASS (maqueta v3): tarjetas con avatar e insignia del rol. Solo el Consejo lo gestiona. */
export function Equipo() {
  const { api } = useApp();
  const avisar = useAvisar();
  const cargar = useCallback(() => api.solicitar<{ equipo: FilaEquipo[] }>('GET', '/v1/equipo'), [api]);
  const { datos, error, prohibido, recargar } = useCarga(cargar);
  const [tapa, setTapa] = useState<Tapado | null>(null);
  const [nueva, setNueva] = useState(false);
  const [falla, setFalla] = useState<string | null>(null);
  const { enviando, ejecutar } = useEnvio();

  async function restablecer(f: FilaEquipo) {
    await ejecutar(async () => {
      setFalla(null);
      try {
        const r = await api.solicitar<AccesoEntregado>('POST', `/v1/equipo/${f.usuarioId}/restablecer-clave`);
        setTapa({ id: f.usuarioId, paso: 'clave', clave: r.claveTemporal });
      } catch (err) {
        setTapa(null);
        setFalla(err instanceof ErrorApi && err.estado === 403 ? 'Esa persona ya no es gestionable o no pertenece a tu JASS.' : mensajeDeError(err));
      }
    });
  }

  async function desactivar(f: FilaEquipo) {
    await ejecutar(async () => {
      setFalla(null);
      try {
        await api.solicitar('POST', `/v1/equipo/${f.usuarioId}/desactivar`);
        setTapa(null);
        avisar(`${f.nombre} ya no puede entrar al sistema.`, 'pausa');
        await recargar();
      } catch (err) {
        setTapa(null);
        setFalla(err instanceof ErrorApi && err.estado === 403 ? 'Esa persona ya no es gestionable o no pertenece a tu JASS.' : mensajeDeError(err));
      }
    });
  }

  if (prohibido) return <SinPermiso />;
  const equipo = datos?.equipo ?? [];
  const orden = ordenEnRol(equipo);
  return (
    <>
      <TituloVista titulo="Equipo" sub="Solo el Consejo agrega, restablece claves o desactiva" acciones={<Bt clase="teal" ic="mas" onClick={() => setNueva(true)}>Agregar persona</Bt>} />
      {error && !datos && <FalloCarga texto={error} recargar={() => void recargar()} />}
      {falla && <p className="error-cajon" role="alert" data-testid="aviso-error">{falla}</p>}
      {!datos && !error ? <Cargando /> : datos && (
        <div className="rejilla" data-testid="tabla-equipo" role="list" aria-label="Equipo de la JASS">
          {equipo.map((p) => {
            const r = ROL_V3[p.rol] ?? ROL_V3.consejo;
            const t = tapa?.id === p.usuarioId ? tapa : null;
            const gestionable = p.rol !== 'consejo' && p.estado === 'activo';
            return (
              <article key={p.usuarioId} className={`persona ${p.estado === 'activo' ? '' : 'inactiva'}`} role="listitem" data-testid={`fila-equipo-${p.nombre}`} aria-label={p.nombre}>
                <div style={{ display: 'contents' }} inert={t !== null}>
                  <Av indice={avatarDePersonal(p.rol, orden[p.usuarioId])} tam="xl" insignia={r.insignia} />
                  <b>{p.nombre}</b>
                  <small>{r.titulo} · DNI {p.documento}</small>
                  <span className={`chip ${p.estado === 'activo' ? 'ok' : 'gris'}`}>{p.estado === 'activo' ? 'Activo' : 'Desactivado'}</span>
                  <span className="botones">
                    {gestionable && <>
                      <Bt clase="borde" ic="llave" onClick={() => setTapa({ id: p.usuarioId, paso: 'clave?' })} aria-label={`Restablecer la clave de ${p.nombre}`}>Clave</Bt>
                      <Bt clase="suave" ic="pausa" onClick={() => setTapa({ id: p.usuarioId, paso: 'desactivar?' })} aria-label={`Desactivar a ${p.nombre}`}>Desactivar</Bt>
                    </>}
                  </span>
                </div>
                <Olas />
                <Tapa abierta={t !== null}>
                  {t?.paso === 'clave?' && <>
                    <h4>¿Restablecer su clave?</h4>
                    <p>Se genera una clave temporal nueva; la anterior deja de servir y deberá cambiarla al entrar.</p>
                    <Bt clase="agua" disabled={enviando} onClick={() => void restablecer(p)}>{enviando ? 'Generando…' : 'Sí, restablecer'}</Bt>
                    <Bt clase="claro" disabled={enviando} onClick={() => setTapa(null)}>Cancelar</Bt>
                  </>}
                  {t?.paso === 'clave' && <>
                    <h4>Clave temporal</h4>
                    <ClaveV3 clave={t.clave} nombre={p.nombre} documento={p.documento} claras={false} />
                    <Bt clase="agua" onClick={() => setTapa(null)}>Listo</Bt>
                  </>}
                  {t?.paso === 'desactivar?' && <>
                    <h4>¿Desactivar?</h4>
                    <p>No podrá ingresar y sus sesiones se cierran ahora. Su historial se conserva.</p>
                    <Bt clase="peligro" disabled={enviando} onClick={() => void desactivar(p)}>{enviando ? 'Desactivando…' : 'Sí, desactivar'}</Bt>
                    <Bt clase="claro" disabled={enviando} onClick={() => setTapa(null)}>Cancelar</Bt>
                  </>}
                </Tapa>
              </article>
            );
          })}
          {equipo.length === 0 && <p className="vacio-l">Todavía no hay personas en el equipo.</p>}
        </div>
      )}
      {datos && equipo.length < 5 && <Banda foto={FOTOS.humedal} sobre="Cada persona con su tarea" titulo="El equipo cuida el agua" texto="El Consejo gestiona el equipo · Tesorería registra pagos · Operación anota lecturas" />}
      {nueva && <CajonPersona cerrar={() => setNueva(false)} alAgregar={() => void recargar()} />}
    </>
  );
}

function CajonPersona({ cerrar, alAgregar }: { cerrar: () => void; alAgregar: () => void }) {
  const { api } = useApp();
  const avisar = useAvisar();
  const [nombre, setNombre] = useState('');
  const [documento, setDocumento] = useState('');
  const [rol, setRol] = useState<'tesorero' | 'operador'>('operador');
  const [errores, setErrores] = useState<{ nombre?: string; documento?: string; general?: string }>({});
  const [hecho, setHecho] = useState<{ nombre: string; documento: string; clave: string } | null>(null);
  const { enviando, ejecutar } = useEnvio();

  async function agregar() {
    if (!nombre.trim()) return setErrores({ nombre: 'Escribe el nombre.' });
    if (!dniValido(documento)) return setErrores({ documento: 'El DNI tiene 8 números.' });
    await ejecutar(async () => {
      setErrores({});
      try {
        const r = await api.solicitar<AccesoEntregado>('POST', '/v1/equipo', { nombre: nombre.trim(), documento, rol });
        setHecho({ nombre: nombre.trim(), documento, clave: r.claveTemporal });
        alAgregar();
      } catch (err) {
        setErrores({ general: err instanceof ErrorApi && err.codigo === 'documento-con-acceso' ? 'Ese DNI ya tiene un acceso en el sistema.' : mensajeDeError(err) });
      }
    });
  }

  if (hecho) {
    const listo = () => { cerrar(); avisar(`${hecho.nombre} ya es parte del equipo`); };
    return (
      <Cajon sobre="Consejo" titulo="Acceso creado" texto="Entrega la clave en persona." cerrar={listo} onEnviar={listo} pie={<Bt type="submit" clase="teal">Listo</Bt>}>
        <Final titulo={`${hecho.nombre} ya es parte del equipo`}>
          <ClaveV3 clave={hecho.clave} nombre={hecho.nombre} documento={hecho.documento} />
          <p>Se muestra una sola vez y deberá cambiarla al entrar.</p>
        </Final>
      </Cajon>
    );
  }
  return (
    <Cajon sobre="Consejo" titulo="Agregar persona" texto="Tesorería u Operación." etiqueta="Agregar persona al equipo" cerrar={() => { if (!enviando) cerrar(); }} onEnviar={() => void agregar()}
      pie={<><Bt clase="borde" disabled={enviando} onClick={cerrar}>Cancelar</Bt><Bt type="submit" clase="teal" disabled={enviando}>{enviando ? 'Creando…' : 'Agregar'}</Bt></>}>
      <Campo id="e-nombre" name="nombre-equipo" etiqueta="Nombre completo" maxLength={120} value={nombre} disabled={enviando} error={errores.nombre} onChange={(e) => setNombre(e.target.value)} />
      <Campo id="documento-equipo" name="documento-equipo" etiqueta="Número de DNI" inputMode="numeric" maxLength={8} value={documento} disabled={enviando} error={errores.documento} onChange={(e) => setDocumento(soloDigitos(e.target.value))} />
      <Elegibles id="e-rol" etiqueta="Su tarea" clase="segmentos" valor={rol} elegir={setRol} deshabilitado={enviando}
        opciones={[{ valor: 'tesorero', contenido: 'Tesorería' }, { valor: 'operador', contenido: 'Operación' }]} />
      {errores.general && <p className="error-cajon" role="alert" data-testid="aviso-error">{errores.general}</p>}
    </Cajon>
  );
}
