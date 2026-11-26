import { useCallback, useState, type FormEvent } from 'react';
import { ErrorApi } from '../api/cliente';
import type { AccesoEntregado } from '../api/tipos';
import { mensajeDeError, useApp } from '../contexto';
import { useCarga, useEnvio } from '../hooks';
import { dniValido, soloDigitos } from '../lib/documento';
import { Aviso, Boton, Carga, Dialogo, ErrorConsulta, Insignia, SinPermiso, Tabla } from '../ui';
import { ClaveEntregada } from './ClaveEntregada';

interface FilaEquipo {
  usuarioId: string;
  nombre: string;
  /** Enmascarado: solo los 3 últimos dígitos. */
  documento: string;
  rol: 'consejo' | 'tesorero' | 'operador';
  estado: 'activo' | 'inactivo';
}

const NOMBRE_ROL: Record<FilaEquipo['rol'], string> = { consejo: 'Consejo', tesorero: 'Tesorería', operador: 'Operador' };

type Accion = { tipo: 'restablecer' | 'desactivar'; fila: FilaEquipo };

/** Equipo de la JASS (Tesorería y Operador): solo lo ve y lo gestiona el Consejo. */
export function Equipo() {
  const { api } = useApp();
  const cargar = useCallback(() => api.solicitar<{ equipo: FilaEquipo[] }>('GET', '/v1/equipo'), [api]);
  const { datos, error, prohibido, cargando, recargar } = useCarga(cargar);
  const [nombre, setNombre] = useState('');
  const [documento, setDocumento] = useState('');
  const [rol, setRol] = useState<'tesorero' | 'operador'>('tesorero');
  const [errorDocumento, setErrorDocumento] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [accion, setAccion] = useState<Accion | null>(null);
  const [entrega, setEntrega] = useState<{ titulo: string; nombre: string; documento: string | null; clave: string } | null>(null);
  const { enviando, ejecutar } = useEnvio();

  async function agregar(e: FormEvent) {
    e.preventDefault();
    if (!dniValido(documento)) return setErrorDocumento('El DNI tiene 8 números.');
    setErrorDocumento(null);
    await ejecutar(async () => {
      setAviso(null);
      try {
        const r = await api.solicitar<AccesoEntregado>('POST', '/v1/equipo', { nombre: nombre.trim(), documento, rol });
        setEntrega({ titulo: 'Acceso creado', nombre: nombre.trim(), documento, clave: r.claveTemporal });
        setNombre('');
        setDocumento('');
        await recargar();
      } catch (err) {
        if (err instanceof ErrorApi && err.codigo === 'documento-con-acceso') setAviso({ tipo: 'error', texto: 'Ese DNI ya tiene un acceso en el sistema.' });
        else setAviso({ tipo: 'error', texto: mensajeDeError(err) });
      }
    });
  }

  if (prohibido) return <SinPermiso />;
  return (
    <section aria-labelledby="titulo-equipo">
      <h1 id="titulo-equipo">Equipo</h1>
      <p className="suave">Las personas de Tesorería y Operadores de tu JASS. Cada una entra con su DNI.</p>
      {error && <ErrorConsulta error={error} recargar={recargar} />}
      <form className="tarjeta en-linea" onSubmit={agregar} aria-label="Agregar persona al equipo" noValidate>
        <h2>Agregar persona</h2>
        <label>
          Nombre completo
          <input name="nombre-equipo" required maxLength={120} value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </label>
        <div className="campo-doc">
          <label htmlFor="documento-equipo">Número de DNI</label>
          <input id="documento-equipo" name="documento-equipo" inputMode="numeric" maxLength={8} autoComplete="off" value={documento}
            aria-invalid={errorDocumento !== null} aria-describedby={errorDocumento ? 'error-documento-equipo' : undefined}
            onChange={(e) => { setDocumento(soloDigitos(e.target.value)); setErrorDocumento(null); }} />
          {errorDocumento && <span id="error-documento-equipo" className="error-campo" role="alert">{errorDocumento}</span>}
        </div>
        <label>
          Rol
          <select name="rol-equipo" value={rol} onChange={(e) => setRol(e.target.value as 'tesorero' | 'operador')}>
            <option value="tesorero">Tesorería</option>
            <option value="operador">Operador</option>
          </select>
        </label>
        <Boton type="submit" variante="primario" disabled={enviando || nombre.trim() === ''}>{enviando ? 'Creando…' : 'Agregar'}</Boton>
      </form>
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
      {cargando && !datos ? <Carga /> : datos && (
        <Tabla nombre="Equipo de la JASS">
          <table className="tabla-padron" role="table" data-testid="tabla-equipo">
            <caption className="solo-lectores">Equipo de la JASS</caption>
            <thead>
              <tr><th scope="col">Nombre</th><th scope="col">DNI</th><th scope="col">Rol</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr>
            </thead>
            <tbody>
              {datos.equipo.map((f) => (
                <tr key={f.usuarioId} data-testid={`fila-equipo-${f.nombre}`}>
                  <td className="nombre-padron">{f.nombre}</td>
                  <td className="documento-padron"><span className="etiqueta-compacta" aria-hidden="true">DNI </span>{f.documento}</td>
                  <td>{NOMBRE_ROL[f.rol]}</td>
                  <td><Insignia tipo={f.estado === 'activo' ? 'ok' : 'advertencia'}>{f.estado === 'activo' ? 'Activo' : 'Inactivo'}</Insignia></td>
                  <td className="acciones">
                    {f.rol !== 'consejo' && f.estado === 'activo' && (
                      <>
                        <button type="button" onClick={() => { setAviso(null); setAccion({ tipo: 'restablecer', fila: f }); }}>Restablecer clave</button>
                        <button type="button" onClick={() => { setAviso(null); setAccion({ tipo: 'desactivar', fila: f }); }}>Desactivar</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {datos.equipo.length === 0 && <tr><td colSpan={5} className="suave">Todavía no hay personas en el equipo.</td></tr>}
            </tbody>
          </table>
        </Tabla>
      )}
      {accion && (
        <ConfirmarAccion
          accion={accion}
          cerrar={() => setAccion(null)}
          alTerminar={(r) => {
            const { fila, tipo } = accion;
            setAccion(null);
            if (tipo === 'restablecer' && r) setEntrega({ titulo: 'Clave restablecida', nombre: fila.nombre, documento: fila.documento, clave: r.claveTemporal });
            else setAviso({ tipo: 'ok', texto: `${fila.nombre} ya no puede entrar al sistema.` });
            void recargar();
          }}
        />
      )}
      {entrega && <ClaveEntregada titulo={entrega.titulo} nombre={entrega.nombre} documento={entrega.documento} clave={entrega.clave} cerrar={() => setEntrega(null)} />}
    </section>
  );
}

function ConfirmarAccion({ accion, cerrar, alTerminar }: { accion: Accion; cerrar: () => void; alTerminar: (r: AccesoEntregado | null) => void }) {
  const { api } = useApp();
  const [error, setError] = useState<string | null>(null);
  const { enviando, ejecutar } = useEnvio();
  const restablecer = accion.tipo === 'restablecer';

  async function confirmar(e: FormEvent) {
    e.preventDefault();
    await ejecutar(async () => {
      setError(null);
      try {
        if (restablecer) alTerminar(await api.solicitar<AccesoEntregado>('POST', `/v1/equipo/${accion.fila.usuarioId}/restablecer-clave`));
        else {
          await api.solicitar('POST', `/v1/equipo/${accion.fila.usuarioId}/desactivar`);
          alTerminar(null);
        }
      } catch (err) {
        setError(err instanceof ErrorApi && err.estado === 403 ? 'Esa persona ya no es gestionable o no pertenece a tu JASS.' : mensajeDeError(err));
      }
    });
  }

  return (
    <Dialogo titulo={restablecer ? 'Restablecer clave' : 'Desactivar acceso'} cerrar={() => { if (!enviando) cerrar(); }}>
      <form onSubmit={confirmar}>
        <strong>{accion.fila.nombre}</strong> · {NOMBRE_ROL[accion.fila.rol]}
        <p>
          {restablecer
            ? 'Se generará una clave temporal nueva, la anterior dejará de servir y tendrá que cambiarla al entrar.'
            : '¿Confirmas que esta persona deje de entrar al sistema? Sus sesiones se cerrarán ahora mismo.'}
        </p>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <div className="pie-dialogo">
          <Boton disabled={enviando} onClick={cerrar}>Cancelar</Boton>
          <Boton type="submit" variante={restablecer ? 'primario' : 'peligro'} disabled={enviando}>
            {enviando ? 'Procesando…' : restablecer ? 'Restablecer clave' : 'Desactivar acceso'}
          </Boton>
        </div>
      </form>
    </Dialogo>
  );
}
