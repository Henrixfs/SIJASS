import { useCallback, useState, type FormEvent } from 'react';
import { LogOut, Plus } from 'lucide-react';
import { ErrorApi } from '../api/cliente';
import { mensajeDeError, useApp } from '../contexto';
import { useCarga, useEnvio } from '../hooks';
import { dniValido, soloDigitos } from '../lib/documento';
import { Marca } from '../identidad';
import { Aviso, Boton, Carga, Dialogo, ErrorConsulta, Insignia, SinPermiso, Tabla } from '../ui';
import { ClaveEntregada } from './ClaveEntregada';
import './plataforma.css';

interface Ubicacion { departamento: string | null; provincia: string | null; distrito: string | null; centroPoblado: string | null }
interface VistaJass { id: string; nombre: string; estado: 'activa' | 'suspendida'; ubicacion: Ubicacion; cuentasActivas: number }

type Accion = { tipo: 'suspender' | 'reactivar' | 'restablecer'; jass: VistaJass };

function dondeEsta(u: Ubicacion): string {
  return [u.centroPoblado, u.distrito, u.provincia, u.departamento].filter(Boolean).join(', ') || 'Sin ubicación';
}

/** Área de la cuenta de plataforma: altas, suspensiones y claves del Consejo. Sin datos de negocio. */
export function Plataforma() {
  const { api, sesion, salir } = useApp();
  const cargar = useCallback(() => api.solicitar<{ jass: VistaJass[] }>('GET', '/v1/plataforma/jass'), [api]);
  const { datos, error, prohibido, cargando, recargar } = useCarga(cargar);
  const [nueva, setNueva] = useState(false);
  const [accion, setAccion] = useState<Accion | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [entrega, setEntrega] = useState<{ titulo: string; nombre: string; documento: string | null; clave: string } | null>(null);
  const { enviando, ejecutar } = useEnvio();

  return (
    <div className="marco-plataforma">
      <a className="saltar" href="#principal">Ir al contenido</a>
      <header className="cabecera-plataforma">
        <Marca />
        <span className="chip-plataforma">Plataforma{sesion?.nombre ? ` · ${sesion.nombre}` : ''}</span>
        <Boton disabled={enviando} onClick={() => void ejecutar(salir)}><LogOut size={17} aria-hidden="true" /> {enviando ? 'Saliendo…' : 'Salir'}</Boton>
      </header>
      <main id="principal" tabIndex={-1}>
        {prohibido ? <SinPermiso /> : (
          <section aria-labelledby="titulo-jass">
            <div className="cabecera-lista">
              <div>
                <h1 id="titulo-jass">JASS</h1>
                <p className="suave">Las juntas que usan SIJASS. Aquí solo ves su estado: nunca sus datos de socios, cuotas o pagos.</p>
              </div>
              <Boton variante="primario" onClick={() => { setAviso(null); setNueva(true); }}><Plus size={18} aria-hidden="true" /> Nueva JASS</Boton>
            </div>
            {error && <ErrorConsulta error={error} recargar={recargar} />}
            {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
            {cargando && !datos ? <Carga /> : datos && (
              <Tabla nombre="JASS de la plataforma">
                <table className="tabla-padron" role="table" data-testid="tabla-jass">
                  <caption className="solo-lectores">JASS de la plataforma</caption>
                  <thead>
                    <tr><th scope="col">Nombre</th><th scope="col">Ubicación</th><th scope="col">Estado</th><th scope="col" className="num">Cuentas activas</th><th scope="col">Acciones</th></tr>
                  </thead>
                  <tbody>
                    {datos.jass.map((j) => (
                      <tr key={j.id} data-testid={`fila-jass-${j.nombre}`}>
                        <td className="nombre-padron">{j.nombre}</td>
                        <td>{dondeEsta(j.ubicacion)}</td>
                        <td><Insignia tipo={j.estado === 'activa' ? 'ok' : 'advertencia'}>{j.estado === 'activa' ? 'Activa' : 'Suspendida'}</Insignia></td>
                        <td className="num">{j.cuentasActivas}</td>
                        <td className="acciones">
                          <button type="button" onClick={() => { setAviso(null); setAccion({ tipo: 'restablecer', jass: j }); }}>Restablecer clave del Consejo</button>
                          {j.estado === 'activa'
                            ? <button type="button" onClick={() => { setAviso(null); setAccion({ tipo: 'suspender', jass: j }); }}>Suspender</button>
                            : <button type="button" onClick={() => { setAviso(null); setAccion({ tipo: 'reactivar', jass: j }); }}>Reactivar</button>}
                        </td>
                      </tr>
                    ))}
                    {datos.jass.length === 0 && <tr><td colSpan={5} className="suave">Todavía no hay JASS. Crea la primera con «Nueva JASS».</td></tr>}
                  </tbody>
                </table>
              </Tabla>
            )}
          </section>
        )}
      </main>
      {nueva && (
        <NuevaJass
          cerrar={() => setNueva(false)}
          alCrear={(r) => {
            setNueva(false);
            setEntrega({ titulo: 'JASS creada', nombre: r.consejo, documento: r.documento, clave: r.clave });
            void recargar();
          }}
        />
      )}
      {accion && (
        <ConfirmarAccion
          accion={accion}
          cerrar={() => setAccion(null)}
          alTerminar={(r) => {
            const { tipo, jass } = accion;
            setAccion(null);
            if (tipo === 'restablecer' && r) setEntrega({ titulo: 'Clave del Consejo restablecida', nombre: r.nombre, documento: r.documento, clave: r.claveTemporal });
            else setAviso({ tipo: 'ok', texto: tipo === 'suspender' ? `${jass.nombre} quedó suspendida. Sus datos se conservan.` : `${jass.nombre} volvió a estar activa.` });
            void recargar();
          }}
        />
      )}
      {entrega && <ClaveEntregada titulo={entrega.titulo} nombre={entrega.nombre} documento={entrega.documento} clave={entrega.clave} cerrar={() => setEntrega(null)} />}
    </div>
  );
}

function NuevaJass({ cerrar, alCrear }: { cerrar: () => void; alCrear: (r: { consejo: string; documento: string; clave: string }) => void }) {
  const { api } = useApp();
  const [nombre, setNombre] = useState('');
  const [ubicacion, setUbicacion] = useState({ departamento: '', provincia: '', distrito: '', centroPoblado: '' });
  const [consejo, setConsejo] = useState('');
  const [documento, setDocumento] = useState('');
  const [errorDocumento, setErrorDocumento] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { enviando, ejecutar } = useEnvio();
  const poner = (campo: keyof typeof ubicacion) => (e: { target: { value: string } }) => setUbicacion({ ...ubicacion, [campo]: e.target.value });

  async function crear(e: FormEvent) {
    e.preventDefault();
    if (!dniValido(documento)) return setErrorDocumento('El DNI tiene 8 números.');
    setErrorDocumento(null);
    await ejecutar(async () => {
      setError(null);
      try {
        const r = await api.solicitar<{ claveTemporal: string }>('POST', '/v1/plataforma/jass', {
          nombre: nombre.trim(),
          ubicacion: Object.fromEntries(Object.entries(ubicacion).map(([k, v]) => [k, v.trim() === '' ? null : v.trim()])),
          consejo: { nombre: consejo.trim(), documento },
        });
        alCrear({ consejo: consejo.trim(), documento, clave: r.claveTemporal });
      } catch (err) {
        if (err instanceof ErrorApi && err.codigo === 'documento-con-acceso') setError('Ese DNI ya tiene un acceso en el sistema.');
        else if (err instanceof ErrorApi && err.codigo === 'jass-duplicada') setError('Ya existe una JASS con ese nombre y esa ubicación.');
        else setError(mensajeDeError(err));
      }
    });
  }

  return (
    <Dialogo titulo="Nueva JASS" cerrar={() => { if (!enviando) cerrar(); }}>
      <form onSubmit={crear} aria-label="Crear JASS" noValidate>
        <label>Nombre de la JASS<input name="nombre-jass" required maxLength={120} value={nombre} onChange={(e) => setNombre(e.target.value)} /></label>
        <fieldset className="ubicacion-jass">
          <legend>Ubicación (opcional)</legend>
          <label>Departamento<input name="departamento" maxLength={80} value={ubicacion.departamento} onChange={poner('departamento')} /></label>
          <label>Provincia<input name="provincia" maxLength={80} value={ubicacion.provincia} onChange={poner('provincia')} /></label>
          <label>Distrito<input name="distrito" maxLength={80} value={ubicacion.distrito} onChange={poner('distrito')} /></label>
          <label>Centro poblado o anexo<input name="centro-poblado" maxLength={80} value={ubicacion.centroPoblado} onChange={poner('centroPoblado')} /></label>
        </fieldset>
        <fieldset className="ubicacion-jass">
          <legend>Primer Consejo</legend>
          <label>Nombre completo<input name="nombre-consejo" required maxLength={120} value={consejo} onChange={(e) => setConsejo(e.target.value)} /></label>
          <div className="campo-doc">
            <label htmlFor="documento-consejo">Número de DNI</label>
            <input id="documento-consejo" name="documento-consejo" inputMode="numeric" maxLength={8} autoComplete="off" value={documento} aria-invalid={errorDocumento !== null}
              aria-describedby={errorDocumento ? 'error-documento-consejo' : undefined}
              onChange={(e) => { setDocumento(soloDigitos(e.target.value)); setErrorDocumento(null); }} />
            {errorDocumento && <span id="error-documento-consejo" className="error-campo" role="alert">{errorDocumento}</span>}
          </div>
        </fieldset>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <div className="pie-dialogo">
          <Boton disabled={enviando} onClick={cerrar}>Cancelar</Boton>
          <Boton type="submit" variante="primario" disabled={enviando || nombre.trim() === '' || consejo.trim() === ''}>{enviando ? 'Creando…' : 'Crear JASS'}</Boton>
        </div>
      </form>
    </Dialogo>
  );
}

function ConfirmarAccion({ accion, cerrar, alTerminar }: { accion: Accion; cerrar: () => void; alTerminar: (r: { nombre: string; documento: string; claveTemporal: string } | null) => void }) {
  const { api } = useApp();
  const [error, setError] = useState<string | null>(null);
  const { enviando, ejecutar } = useEnvio();
  const { tipo, jass } = accion;
  const titulo = { suspender: 'Suspender la JASS', reactivar: 'Reactivar la JASS', restablecer: 'Restablecer la clave del Consejo' }[tipo];
  const texto = {
    suspender: 'Sus cuentas no podrán iniciar ni renovar sesión hasta que la reactives. Los datos de la JASS se conservan.',
    reactivar: 'Sus cuentas podrán volver a entrar con sus claves de siempre.',
    restablecer: 'Se generará una clave temporal nueva para el Consejo, la anterior dejará de servir y tendrá que cambiarla al entrar.',
  }[tipo];

  async function confirmar(e: FormEvent) {
    e.preventDefault();
    await ejecutar(async () => {
      setError(null);
      try {
        if (tipo === 'restablecer') alTerminar(await api.solicitar('POST', `/v1/plataforma/jass/${jass.id}/consejo/restablecer-clave`, {}));
        else {
          await api.solicitar('POST', `/v1/plataforma/jass/${jass.id}/${tipo === 'suspender' ? 'suspender' : 'reactivar'}`);
          alTerminar(null);
        }
      } catch (err) {
        setError(err instanceof ErrorApi && err.codigo === 'sin-consejo-activo' ? 'Esta JASS no tiene un Consejo activo.' : mensajeDeError(err));
      }
    });
  }

  return (
    <Dialogo titulo={titulo} cerrar={() => { if (!enviando) cerrar(); }}>
      <form onSubmit={confirmar}>
        <strong>{jass.nombre}</strong>
        <p>{texto}</p>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <div className="pie-dialogo">
          <Boton disabled={enviando} onClick={cerrar}>Cancelar</Boton>
          <Boton type="submit" variante={tipo === 'suspender' ? 'peligro' : 'primario'} disabled={enviando}>{enviando ? 'Procesando…' : titulo}</Boton>
        </div>
      </form>
    </Dialogo>
  );
}
