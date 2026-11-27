import { useCallback, useState } from 'react';
import { ErrorApi } from '../api/cliente';
import { mensajeDeError, useApp } from '../contexto';
import { useCarga, useEnvio } from '../hooks';
import { dniValido, soloDigitos } from '../lib/documento';
import { FOTOS, type NombreFoto } from '../lib/fotos';
import { SinPermiso } from '../ui';
import { Av, Avisos, Bt, Cajon, Campo, Cargando, ClaveV3, FalloCarga, Final, fondo, Ic, Olas, Tapa, useAvisar } from '../v3/base';

interface Ubicacion { departamento: string | null; provincia: string | null; distrito: string | null; centroPoblado: string | null }
interface VistaJass { id: string; nombre: string; estado: 'activa' | 'suspendida'; ubicacion: Ubicacion; cuentasActivas: number }
type Tapado = { id: string; paso: 'suspender?' | 'clave?' } | { id: string; paso: 'clave'; clave: string; nombre: string; documento: string };

const FOTOS_JASS: NombreFoto[] = ['paron', 'bofedales', 'humedal', 'puquio', 'tinajones', 'gocta'];

function dondeEsta(u: Ubicacion): string {
  const lugar = [u.provincia, u.departamento].filter(Boolean).join(', ');
  return [u.centroPoblado ?? u.distrito, lugar].filter(Boolean).join(' · ') || 'Sin ubicación registrada';
}

/** Plataforma (maqueta v3): las JASS con su foto, su estado y sus cuentas. Sin datos de negocio. */
export function Plataforma() {
  return <div className="v3"><Avisos><PanelPlataforma /></Avisos></div>;
}

function PanelPlataforma() {
  const { api, sesion, salir } = useApp();
  const avisar = useAvisar();
  const cargar = useCallback(() => api.solicitar<{ jass: VistaJass[] }>('GET', '/v1/plataforma/jass'), [api]);
  const { datos, error, prohibido, recargar } = useCarga(cargar);
  const [nueva, setNueva] = useState(false);
  const [tapa, setTapa] = useState<Tapado | null>(null);
  const [falla, setFalla] = useState<string | null>(null);
  const salida = useEnvio();
  const accion = useEnvio();

  async function ejecutarAccion(j: VistaJass, tipo: 'suspender' | 'reactivar' | 'restablecer') {
    await accion.ejecutar(async () => {
      setFalla(null);
      try {
        if (tipo === 'restablecer') {
          const r = await api.solicitar<{ nombre: string; documento: string; claveTemporal: string }>('POST', `/v1/plataforma/jass/${j.id}/consejo/restablecer-clave`, {});
          setTapa({ id: j.id, paso: 'clave', clave: r.claveTemporal, nombre: r.nombre, documento: r.documento });
          return;
        }
        await api.solicitar('POST', `/v1/plataforma/jass/${j.id}/${tipo}`);
        setTapa(null);
        avisar(tipo === 'suspender' ? `${j.nombre} quedó suspendida. Sus datos se conservan.` : `${j.nombre} volvió a estar activa.`, tipo === 'suspender' ? 'pausa' : 'check');
        await recargar();
      } catch (err) {
        setTapa(null);
        setFalla(err instanceof ErrorApi && err.codigo === 'sin-consejo-activo' ? 'Esta JASS no tiene un Consejo activo.' : mensajeDeError(err));
      }
    });
  }

  const lista = datos?.jass ?? [];
  const activas = lista.filter((j) => j.estado === 'activa');
  return (
    <div className="esc-plataforma">
      <a className="saltar" href="#principal">Ir al contenido</a>
      <div className="plat-scroll">
        <header className="plat-hero">
          <div className="img" role="img" aria-label="Orilla de la laguna Parón, Áncash: agua turquesa" />
          <div className="v" />
          <div className="barra-top">
            <div className="marca"><span className="gota"><Ic n="gota" /></span>SIJASS</div>
            <span className="etiqueta"><Ic n="shield" />Plataforma</span>
            <div className="yo"><Av indice={15} tam="s" /><div><b>{sesion?.nombre || 'Administración'}</b><small>Plataforma</small></div></div>
            <Bt clase="claro" ic="salir" disabled={salida.enviando} onClick={() => void salida.ejecutar(salir)}>{salida.enviando ? 'Saliendo…' : 'Salir'}</Bt>
          </div>
          <div className="t">
            <small>Panel general</small>
            <h1 id="titulo-jass">Las juntas de agua, en un solo lugar.</h1>
            <p>Crea una JASS, suspéndela o reactívala. La plataforma no ve sus cuotas, sus pagos ni sus lecturas.</p>
            <Bt clase="agua" ic="mas" onClick={() => setNueva(true)}>Nueva JASS</Bt>
          </div>
          {datos && (
            <div className="cifras">
              <div className="cifra"><b>{activas.length}</b><span><Ic n="gota" />JASS activas</span></div>
              <div className="cifra"><b>{lista.length - activas.length}</b><span><Ic n="pausa" />Suspendidas</span></div>
              <div className="cifra"><b>{activas.reduce((s, j) => s + j.cuentasActivas, 0)}</b><span><Ic n="users" />Cuentas activas</span></div>
            </div>
          )}
          <p className="credito" style={{ position: 'absolute', right: 50, bottom: 62 }}>Foto: Laguna Parón · Txolo · CC BY-SA 4.0</p>
          <Olas />
        </header>
        <main id="principal" tabIndex={-1}>
          {prohibido ? <SinPermiso /> : (
            <div className="rejilla-jass" data-testid="tabla-jass" role="list" aria-label="JASS de la plataforma">
              {error && !datos && <div style={{ gridColumn: '1/-1' }}><FalloCarga texto={error} recargar={() => void recargar()} /></div>}
              {falla && <p className="error-cajon" role="alert" data-testid="aviso-error" style={{ gridColumn: '1/-1' }}>{falla}</p>}
              {!datos && !error && <div style={{ gridColumn: '1/-1' }}><Cargando /></div>}
              {lista.map((j, i) => {
                const f = FOTOS[FOTOS_JASS[i % FOTOS_JASS.length]];
                const activa = j.estado === 'activa';
                const t = tapa?.id === j.id ? tapa : null;
                return (
                  <article key={j.id} className={`jass-c ${activa ? '' : 'suspendida'}`} role="listitem" aria-label={j.nombre} data-testid={`fila-jass-${j.nombre}`}>
                    <div style={{ display: 'contents' }} inert={t !== null}>
                      <div className="foto-c">
                        <div className="img" style={fondo(f)} />
                        <span className={`chip ${activa ? 'ok' : 'gris'}`}><Ic n={activa ? 'gota' : 'pausa'} />{activa ? 'Activa' : 'Suspendida'}</span>
                        <span className="cred">Foto referencial<br />{f.autor} · {f.licencia}</span>
                        <Olas />
                      </div>
                      <div className="cu">
                        <h3>{j.nombre}</h3>
                        <p className="ubic"><Ic n="lugar" />{dondeEsta(j.ubicacion)}</p>
                        <div className="cuentas">
                          <span>{activa ? 'Cuentas activas' : 'Cuentas sin acceso'} <b>{j.cuentasActivas}</b></span>
                          <div className="gente" aria-hidden="true">{Array.from({ length: Math.min(j.cuentasActivas, 8) }, (_, n) => <Ic key={n} n="persona" lleno />)}{j.cuentasActivas > 8 && <em>+{j.cuentasActivas - 8}</em>}</div>
                        </div>
                        <div className="acciones">
                          <Bt clase="borde" ic="llave" disabled={!activa} aria-label={`Restablecer la clave del Consejo de ${j.nombre}`} onClick={() => setTapa({ id: j.id, paso: 'clave?' })}>Nueva clave</Bt>
                          {activa
                            ? <Bt clase="suave" ic="pausa" onClick={() => setTapa({ id: j.id, paso: 'suspender?' })}>Suspender</Bt>
                            : <Bt clase="suave" ic="reanudar" disabled={accion.enviando} onClick={() => void ejecutarAccion(j, 'reactivar')}>Reactivar</Bt>}
                        </div>
                      </div>
                    </div>
                    <Tapa abierta={t !== null}>
                      {t?.paso === 'suspender?' && <>
                        <Ic n="pausa" className="grande" />
                        <h4>¿Suspender esta JASS?</h4>
                        <p>Sus cuentas no podrán ingresar. Sus datos se conservan.</p>
                        <Bt clase="peligro" disabled={accion.enviando} onClick={() => void ejecutarAccion(j, 'suspender')}>{accion.enviando ? 'Suspendiendo…' : 'Sí, suspender'}</Bt>
                        <Bt clase="claro" disabled={accion.enviando} onClick={() => setTapa(null)}>Cancelar</Bt>
                      </>}
                      {t?.paso === 'clave?' && <>
                        <Ic n="llave" className="grande" />
                        <h4>¿Nueva clave para el Consejo?</h4>
                        <p>La anterior deja de servir y deberá cambiarla al entrar.</p>
                        <Bt clase="agua" disabled={accion.enviando} onClick={() => void ejecutarAccion(j, 'restablecer')}>{accion.enviando ? 'Generando…' : 'Sí, generar clave'}</Bt>
                        <Bt clase="claro" disabled={accion.enviando} onClick={() => setTapa(null)}>Cancelar</Bt>
                      </>}
                      {t?.paso === 'clave' && <>
                        <h4>Clave temporal del Consejo</h4>
                        <ClaveV3 clave={t.clave} nombre={t.nombre} documento={t.documento} claras={false} />
                        <Bt clase="agua" onClick={() => setTapa(null)}>Listo</Bt>
                      </>}
                    </Tapa>
                  </article>
                );
              })}
              {datos && (
                <button type="button" className="nueva-c" onClick={() => setNueva(true)}>
                  <span className="gota"><Ic n="mas" className="grande" /></span><b>Crear una JASS</b><small>Con su primer Consejo y una clave temporal</small><Olas />
                </button>
              )}
              <p className="pie-plat"><Ic n="shield" />La plataforma solo ve nombre, ubicación, estado y número de cuentas. Las fotos son referenciales: el sistema todavía no guarda fotos.</p>
            </div>
          )}
        </main>
      </div>
      {nueva && <CajonNuevaJass cerrar={() => setNueva(false)} alCrear={() => void recargar()} />}
    </div>
  );
}

function CajonNuevaJass({ cerrar, alCrear }: { cerrar: () => void; alCrear: () => void }) {
  const { api } = useApp();
  const avisar = useAvisar();
  const [paso, setPaso] = useState<1 | 2 | 3>(1);
  const [nombre, setNombre] = useState('');
  const [ubicacion, setUbicacion] = useState({ departamento: '', provincia: '', distrito: '', centroPoblado: '' });
  const [consejo, setConsejo] = useState('');
  const [documento, setDocumento] = useState('');
  const [errores, setErrores] = useState<{ nombre?: string; consejo?: string; documento?: string; general?: string }>({});
  const [hecho, setHecho] = useState<{ nombre: string; consejo: string; documento: string; clave: string } | null>(null);
  const { enviando, ejecutar } = useEnvio();
  const poner = (campo: keyof typeof ubicacion) => (e: { target: { value: string } }) => setUbicacion({ ...ubicacion, [campo]: e.target.value });
  const textos = ['Ponle nombre a la junta de agua.', '¿Dónde está? Puedes dejarlo en blanco.', 'La persona que la administrará primero.'];

  async function seguir() {
    setErrores({});
    if (paso === 1) return nombre.trim() ? setPaso(2) : setErrores({ nombre: 'Escribe el nombre de la JASS.' });
    if (paso === 2) return setPaso(3);
    if (!consejo.trim()) return setErrores({ consejo: 'Escribe el nombre de la persona.' });
    if (!dniValido(documento)) return setErrores({ documento: 'El DNI tiene 8 números.' });
    await ejecutar(async () => {
      try {
        const r = await api.solicitar<{ claveTemporal: string }>('POST', '/v1/plataforma/jass', {
          nombre: nombre.trim(),
          ubicacion: Object.fromEntries(Object.entries(ubicacion).map(([k, v]) => [k, v.trim() === '' ? null : v.trim()])),
          consejo: { nombre: consejo.trim(), documento },
        });
        setHecho({ nombre: nombre.trim(), consejo: consejo.trim(), documento, clave: r.claveTemporal });
        alCrear();
      } catch (err) {
        if (err instanceof ErrorApi && err.codigo === 'documento-con-acceso') setErrores({ documento: 'Ese DNI ya tiene un acceso en el sistema.' });
        else if (err instanceof ErrorApi && err.codigo === 'jass-duplicada') setErrores({ general: 'Ya existe una JASS con ese nombre y esa ubicación.' });
        else setErrores({ general: mensajeDeError(err) });
      }
    });
  }

  if (hecho) {
    const listo = () => { cerrar(); avisar(`${hecho.nombre} está creada`); };
    return (
      <Cajon sobre="Plataforma" titulo="JASS creada" texto="Entrega la clave en persona." cerrar={listo} onEnviar={listo} pie={<Bt type="submit" clase="teal">Listo</Bt>}>
        <Final titulo={`${hecho.nombre} está creada`}>
          <ClaveV3 clave={hecho.clave} nombre={hecho.consejo} documento={hecho.documento} />
          <p>Se muestra una sola vez y deberá cambiarla al entrar.</p>
        </Final>
      </Cajon>
    );
  }
  return (
    <Cajon sobre="Plataforma" titulo="Nueva JASS" texto={textos[paso - 1]} etiqueta="Crear JASS" cerrar={() => { if (!enviando) cerrar(); }} onEnviar={() => void seguir()}
      pie={<>
        <Bt clase="borde" disabled={enviando} onClick={() => (paso === 1 ? cerrar() : setPaso((paso - 1) as 1 | 2))}>{paso === 1 ? 'Cancelar' : 'Atrás'}</Bt>
        <Bt type="submit" clase="teal" disabled={enviando}>{enviando ? 'Creando…' : paso === 3 ? <>Crear JASS <Ic n="check" /></> : <>Siguiente <Ic n="flecha" /></>}</Bt>
      </>}>
      <div className="pasos" aria-label={`Paso ${paso} de 3`}>
        {['Nombre', 'Ubicación', 'Consejo'].map((t, i) => <div key={t} className={i < paso ? 'hecho' : ''}><i />{t}</div>)}
      </div>
      {paso === 1 && <Campo id="j-nombre" name="nombre-jass" etiqueta="Nombre de la JASS" maxLength={120} value={nombre} error={errores.nombre} onChange={(e) => setNombre(e.target.value)} />}
      {paso === 2 && (
        <div className="dos">
          <div><Campo id="j-dep" name="departamento" etiqueta="Departamento" maxLength={80} value={ubicacion.departamento} onChange={poner('departamento')} /></div>
          <div><Campo id="j-pro" name="provincia" etiqueta="Provincia" maxLength={80} value={ubicacion.provincia} onChange={poner('provincia')} /></div>
          <div><Campo id="j-dis" name="distrito" etiqueta="Distrito" maxLength={80} value={ubicacion.distrito} onChange={poner('distrito')} /></div>
          <div><Campo id="j-cp" name="centro-poblado" etiqueta="Centro poblado o anexo" maxLength={80} value={ubicacion.centroPoblado} onChange={poner('centroPoblado')} /></div>
        </div>
      )}
      {paso === 3 && <>
        <Campo id="j-persona" name="nombre-consejo" etiqueta="Nombre de quien preside el Consejo" maxLength={120} value={consejo} error={errores.consejo} disabled={enviando} onChange={(e) => setConsejo(e.target.value)} />
        <Campo id="documento-consejo" name="documento-consejo" etiqueta="Número de DNI" inputMode="numeric" maxLength={8} value={documento} error={errores.documento} disabled={enviando} onChange={(e) => setDocumento(soloDigitos(e.target.value))} />
      </>}
      {errores.general && <p className="error-cajon" role="alert" data-testid="aviso-error">{errores.general}</p>}
    </Cajon>
  );
}
