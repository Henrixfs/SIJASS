/**
 * Cajones de Tesorería y del padrón (maqueta v3): cuenta de un asociado, cobrar, generar cuotas,
 * revertir un pago y registrar un asociado. Todo va contra la API real.
 */
import { useCallback, useMemo, useState } from 'react';
import { ErrorApi } from '../api/cliente';
import type { AccesoEntregado, EstadoDeCuenta, PagoConReversa, ResumenAsociado, VistaPago } from '../api/tipos';
import { mensajeDeError, useApp } from '../contexto';
import { useCarga, useEnvio } from '../hooks';
import { fechaPago, formatearSoles, parsearSoles } from '../lib/dinero';
import { nuevoUuid } from '../lib/uuid';
import { Av, Bt, Cajon, Campo, Cargando, ClaveV3, Elegibles, Final, Gotas, Ic, useAvisar } from '../v3/base';
import { cuando, mesDe } from '../v3/datos';

const ErrorCajon = ({ texto }: { texto: string | null }) => (texto ? <p className="error-cajon" role="alert" data-testid="aviso-error">{texto}</p> : null);

// ───────────────────────── Motivo de una reversa ─────────────────────────

/** Motivo y fecha de la reversa de un pago: se piden al abrirlo (`GET /v1/pagos/:id`). */
export function MotivoReversa({ pagoId }: { pagoId: string }) {
  const { api } = useApp();
  const cargar = useCallback(() => api.solicitar<PagoConReversa>('GET', `/v1/pagos/${pagoId}`), [api, pagoId]);
  const { datos, error, prohibido, recargar } = useCarga(cargar);
  return (
    <div className="motivo-r" id={`motivo-${pagoId}`} data-testid={`motivo-${pagoId}`} role="region" aria-label="Reversa del pago" aria-live="polite">
      {!datos && !error && !prohibido && <p>Leyendo el motivo…</p>}
      {prohibido && <p>Su rol no puede ver el detalle de este pago.</p>}
      {error && !datos && <p>{error} <button type="button" className="mini-bt neutro" onClick={() => void recargar()}>Reintentar</button></p>}
      {datos && (datos.reversa
        ? <dl><div><dt>Fecha de la reversa</dt><dd>{fechaPago(datos.reversa.creadaEn)}</dd></div><div><dt>Motivo</dt><dd>{datos.reversa.motivo}</dd></div></dl>
        : <p>Este pago no tiene una reversa registrada.</p>)}
    </div>
  );
}

/** Botón que abre y cierra el motivo de un pago revertido. */
export function VerMotivo({ pago, abierto, alternar }: { pago: VistaPago; abierto: boolean; alternar: () => void }) {
  return (
    <button type="button" className="mini-bt neutro" aria-expanded={abierto} aria-controls={abierto ? `motivo-${pago.id}` : undefined}
      aria-label={`Motivo de la reversa del pago ${pago.comprobante}`} onClick={alternar}>{abierto ? 'Ocultar' : 'Motivo'}</button>
  );
}

// ───────────────────────── Cuenta de un asociado ─────────────────────────

export function CajonCuenta({ asociadoId, cerrar, alCambiar, cobrar, revertir }: {
  asociadoId: string;
  cerrar: () => void;
  alCambiar: () => void;
  cobrar: (cuenta: EstadoDeCuenta) => void;
  revertir: (pago: VistaPago, cuenta: EstadoDeCuenta) => void;
}) {
  const { api } = useApp();
  const avisar = useAvisar();
  const cargar = useCallback(() => api.solicitar<EstadoDeCuenta>('GET', `/v1/asociados/${asociadoId}/estado-de-cuenta`), [api, asociadoId]);
  const { datos, error, prohibido, recargar } = useCarga(cargar);
  const [clave, setClave] = useState<AccesoEntregado | null>(null);
  const [confirmarBaja, setConfirmarBaja] = useState(false);
  const [confirmarClave, setConfirmarClave] = useState(false);
  const [falla, setFalla] = useState<string | null>(null);
  const [motivoDe, setMotivoDe] = useState<string | null>(null);
  const { enviando, ejecutar } = useEnvio();

  async function acceso() {
    if (!datos) return;
    const restablecer = datos.acceso === 'activo';
    await ejecutar(async () => {
      setFalla(null);
      try {
        setClave(await api.solicitar<AccesoEntregado>('POST', `/v1/asociados/${asociadoId}/acceso${restablecer ? '/restablecer' : ''}`));
        await recargar();
        alCambiar();
      } catch (err) {
        if (err instanceof ErrorApi && err.codigo === 'documento-con-acceso') setFalla('Ese DNI ya tiene un acceso en el sistema.');
        else if (err instanceof ErrorApi && err.codigo === 'documento-no-es-dni') setFalla('El documento del padrón no es un DNI de 8 números. Corrígelo antes de crear el acceso.');
        else if (err instanceof ErrorApi && err.codigo === 'asociado-con-cuenta') setFalla('El asociado ya tiene acceso. Usa «Restablecer clave».');
        else if (err instanceof ErrorApi && err.codigo === 'asociado-sin-acceso') setFalla('El asociado todavía no tiene acceso. Usa «Crear acceso».');
        else setFalla(mensajeDeError(err));
      }
    });
  }

  async function darDeBaja() {
    await ejecutar(async () => {
      setFalla(null);
      try {
        await api.solicitar('POST', `/v1/asociados/${asociadoId}/baja`);
        setConfirmarBaja(false);
        avisar(`${datos?.asociado.nombre ?? 'El asociado'} fue dado de baja. Su historial se conserva.`, 'pausa');
        await recargar();
        alCambiar();
      } catch (err) {
        setFalla(err instanceof ErrorApi && err.estado === 403 ? 'Su rol no tiene permiso para dar de baja a este asociado.' : mensajeDeError(err));
      }
    });
  }

  const a = datos?.asociado;
  const activo = a?.estado === 'activo';
  const pagos = [...(datos?.pagos ?? [])].sort((x, y) => Date.parse(y.pagadoEn) - Date.parse(x.pagadoEn));
  return (
    <Cajon sobre="Estado de cuenta" titulo={a?.nombre ?? 'Cuenta del asociado'} texto={a ? `DNI ${a.documento}${activo ? '' : ' · de baja'}` : undefined} cerrar={cerrar}
      onEnviar={() => { if (datos) cobrar(datos); }}
      pie={<><Bt clase="borde" onClick={cerrar}>Cerrar</Bt>{datos && activo && datos.saldoCentimos > 0 && <Bt type="submit" clase="teal">Registrar pago</Bt>}</>}>
      {!datos && !error && !prohibido && <Cargando />}
      {prohibido && <p className="error-cajon" role="alert" data-testid="sin-permiso">Su rol no tiene acceso a esta cuenta.</p>}
      {error && <ErrorCajon texto={error} />}
      {datos && a && (
        <>
          <div className="cuenta-cab"><Av id={a.id} tam="xl" /><div><small>Saldo</small><b data-testid="saldo-asociado">{formatearSoles(datos.saldoCentimos)}</b></div></div>
          <Gotas cuotas={datos.cuotas} />
          <span className="etq" style={{ marginTop: 16 }}>Pagos</span>
          <div className="pagos-c" data-testid="tabla-pagos">
            {pagos.length === 0 && <p className="nota">Todavía no hay pagos.</p>}
            {pagos.map((p) => (
              <div className="fam corta" key={p.id} data-testid={`pago-${p.comprobante}`}>
                <div><b>{mesDe(p.periodo)}</b><small>{p.comprobante} · {cuando(p.pagadoEn, true)}</small></div>
                <span className={`chip ${p.estado === 'vigente' ? 'ok' : 'gris'}`}>{p.estado === 'vigente' ? 'Vigente' : 'Revertido'}</span>
                <span className="m">{formatearSoles(p.importeCentimos)}</span>
                {p.estado === 'vigente'
                  ? <button type="button" className="mini-bt" onClick={() => revertir(p, datos)}><Ic n="revertir" />Revertir</button>
                  : <VerMotivo pago={p} abierto={motivoDe === p.id} alternar={() => setMotivoDe(motivoDe === p.id ? null : p.id)} />}
                {motivoDe === p.id && <MotivoReversa pagoId={p.id} />}
              </div>
            ))}
          </div>
          <ErrorCajon texto={falla} />
          {activo ? (
            <>
              <div className="acceso-c">
                <span><Ic n="llave" /><b data-testid="estado-acceso">{datos.acceso === 'activo' ? 'Tiene acceso a su portal' : datos.acceso === 'inactivo' ? 'Su acceso está inactivo' : 'Aún no tiene acceso'}</b></span>
                {datos.acceso !== 'inactivo' && !clave && !confirmarClave && <Bt clase="borde" disabled={enviando} onClick={() => (datos.acceso === 'activo' ? setConfirmarClave(true) : void acceso())}>{datos.acceso === 'activo' ? 'Restablecer clave' : 'Crear acceso'}</Bt>}
              </div>
              {confirmarClave && !clave && (
                <div className="confirmar-c" role="group" aria-label="Confirmar nueva clave">
                  <p>¿Restablecer la clave de {a.nombre}? La anterior deja de servir y deberá cambiar la nueva al entrar.</p>
                  <div className="botones-cuenta"><Bt clase="teal" disabled={enviando} onClick={() => void acceso()}>Sí, restablecer</Bt><Bt clase="borde" onClick={() => setConfirmarClave(false)}>Cancelar</Bt></div>
                </div>
              )}
              <div className="clave-c">{clave && <ClaveV3 clave={clave.claveTemporal} nombre={a.nombre} documento={a.documento} />}</div>
              {!confirmarBaja
                ? <div className="botones-cuenta"><Bt clase="suave" ic="pausa" onClick={() => setConfirmarBaja(true)}>Dar de baja</Bt></div>
                : (
                  <div className="confirmar-c" role="group" aria-label="Confirmar baja">
                    <p>¿Dar de baja a {a.nombre}? Ya no se le generarán cuotas. Su historial de cuotas y pagos se conserva.</p>
                    <div className="botones-cuenta"><Bt clase="peligro" disabled={enviando} onClick={() => void darDeBaja()}>Confirmar baja</Bt><Bt clase="borde" onClick={() => setConfirmarBaja(false)}>Cancelar</Bt></div>
                  </div>
                )}
            </>
          ) : <p className="nota" style={{ marginTop: 12 }}>El asociado está dado de baja: solo se consulta su historial.</p>}
        </>
      )}
    </Cajon>
  );
}

// ───────────────────────── Cobrar ─────────────────────────

export function CajonPago({ deudores, cuentas, inicial, cerrar, alRegistrar }: {
  deudores: ResumenAsociado[];
  cuentas: Record<string, EstadoDeCuenta>;
  inicial: string | null;
  cerrar: () => void;
  alRegistrar: () => void;
}) {
  const { api } = useApp();
  const avisar = useAvisar();
  const [quien, setQuien] = useState(deudores.some((d) => d.id === inicial) ? inicial! : deudores[0]?.id ?? '');
  const [extra, setExtra] = useState<Record<string, EstadoDeCuenta>>({});
  const cuenta = cuentas[quien] ?? extra[quien];
  const pendientes = useMemo(() => [...(cuenta?.cuotas ?? [])].filter((c) => c.pendienteCentimos > 0).sort((a, b) => a.periodo.localeCompare(b.periodo)), [cuenta]);
  const [cuotaId, setCuotaId] = useState<string | null>(null);
  const cuota = pendientes.find((c) => c.id === cuotaId) ?? pendientes[0] ?? null;
  const [importe, setImporte] = useState<string | null>(null);
  const [comprobante, setComprobante] = useState('');
  const [errores, setErrores] = useState<{ importe?: string; comprobante?: string; general?: string }>({});
  const [hecho, setHecho] = useState<{ nombre: string; importe: number; periodo: string; comprobante: string; asociadoId: string; quedan: number | null } | null>(null);
  const [clave, setClave] = useState(nuevoUuid);
  const { enviando, ejecutar } = useEnvio();
  const persona = deudores.find((d) => d.id === quien);
  const importeVisible = importe ?? (cuota ? (cuota.pendienteCentimos / 100).toFixed(2) : '');

  // Si la cuenta no vino con el padrón, se pide aquí.
  const pedir = useCallback(async () => {
    if (!quien || cuentas[quien] || extra[quien]) return null;
    const c = await api.solicitar<EstadoDeCuenta>('GET', `/v1/asociados/${quien}/estado-de-cuenta`);
    setExtra((x) => ({ ...x, [quien]: c }));
    return c;
  }, [api, quien, cuentas, extra]);
  useCarga(pedir);

  const cambio = () => { setClave(nuevoUuid()); setErrores({}); };

  async function registrar() {
    if (!cuota || !persona) return;
    const centimos = parsearSoles(importeVisible);
    if (centimos === null) return setErrores({ importe: 'Escribe un importe mayor que 0, por ejemplo 15.00.' });
    if (centimos > cuota.pendienteCentimos) return setErrores({ importe: `No puede superar lo pendiente: ${formatearSoles(cuota.pendienteCentimos)}.` });
    if (!comprobante.trim()) return setErrores({ comprobante: 'Escribe el número de comprobante.' });
    await ejecutar(async () => {
      setErrores({});
      try {
        await api.solicitar('POST', '/v1/pagos', { cuotaId: cuota.id, importeCentimos: centimos, comprobante: comprobante.trim() }, { 'Idempotency-Key': clave });
        let quedan: number | null = null;
        try { quedan = (await api.solicitar<EstadoDeCuenta>('GET', `/v1/asociados/${persona.id}/estado-de-cuenta`)).saldoCentimos; } catch { /* se muestra sin saldo */ }
        setHecho({ nombre: persona.nombre, importe: centimos, periodo: cuota.periodo, comprobante: comprobante.trim(), asociadoId: persona.id, quedan });
        alRegistrar();
      } catch (err) {
        setErrores({ general: mensajeDeError(err) });
      }
    });
  }

  if (hecho) {
    return (
      <Cajon sobre="Tesorería" titulo="Registrar pago" texto="Pago registrado." cerrar={() => { cerrar(); avisar('Pago registrado'); }}
        onEnviar={() => { cerrar(); avisar('Pago registrado'); }} pie={<Bt type="submit" clase="teal">Listo</Bt>}>
        <Final titulo="Pago registrado">
          <div className="recibo"><Av id={hecho.asociadoId} tam="xl" /><b>{formatearSoles(hecho.importe)}</b><span>{hecho.nombre} · cuota de {mesDe(hecho.periodo).toLowerCase()}</span><small>{hecho.comprobante}{hecho.quedan !== null ? ` · quedan ${formatearSoles(hecho.quedan)}` : ''}</small></div>
        </Final>
      </Cajon>
    );
  }
  return (
    <Cajon sobre="Tesorería" titulo="Registrar pago" texto="Elige a la persona y la cuota." cerrar={() => { if (!enviando) cerrar(); }} onEnviar={() => void registrar()}
      pie={<><Bt clase="borde" disabled={enviando} onClick={cerrar}>Cancelar</Bt><Bt type="submit" clase="teal" disabled={enviando || !cuota}>{enviando ? 'Registrando…' : 'Registrar pago'}</Bt></>}>
      {deudores.length === 0 ? <p className="nota">Nadie tiene saldo pendiente.</p> : (
        <>
          <Elegibles id="p-quien" etiqueta="¿Quién paga?" clase="quienes" valor={quien} deshabilitado={enviando}
            elegir={(v) => { setQuien(v); setCuotaId(null); setImporte(null); cambio(); }}
            opciones={deudores.map((d) => ({ valor: d.id, nombre: d.nombre, contenido: <><Av id={d.id} tam="m" /><span>{d.nombre.split(' ')[0]}</span></> }))} />
          {!cuenta ? <Cargando texto="Leyendo sus cuotas…" /> : pendientes.length === 0 ? <p className="nota">Esta persona no tiene cuotas pendientes.</p> : (
            <Elegibles id="p-cuota" etiqueta="Cuota" clase="segmentos tres" valor={cuota?.id ?? null} deshabilitado={enviando}
              elegir={(v) => { setCuotaId(v); setImporte(null); cambio(); }}
              opciones={pendientes.map((c) => ({ valor: c.id, nombre: `${mesDe(c.periodo)} ${c.periodo.slice(0, 4)}, pendiente ${formatearSoles(c.pendienteCentimos)}`, contenido: <>{mesDe(c.periodo)}<small>{formatearSoles(c.pendienteCentimos)}</small></> }))} />
          )}
          <Campo id="p-importe" etiqueta="Importe (S/)" inputMode="decimal" value={importeVisible} disabled={enviando} error={errores.importe}
            onChange={(e) => { setImporte(e.target.value); cambio(); }} />
          <Campo id="p-comp" etiqueta="Número de comprobante" maxLength={60} value={comprobante} disabled={enviando} error={errores.comprobante} placeholder="Ejemplo: R-2026-006"
            onChange={(e) => { setComprobante(e.target.value); cambio(); }} />
          <ErrorCajon texto={errores.general ?? null} />
        </>
      )}
    </Cajon>
  );
}

// ───────────────────────── Generar cuotas ─────────────────────────

export function CajonGenerar({ importeSugerido, cerrar, alGenerar }: { importeSugerido: number | null; cerrar: () => void; alGenerar: () => void }) {
  const { api } = useApp();
  const avisar = useAvisar();
  const hoy = new Date();
  const [periodo, setPeriodo] = useState(`${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`);
  const [importe, setImporte] = useState(importeSugerido ? (importeSugerido / 100).toFixed(2) : '');
  const [errores, setErrores] = useState<{ periodo?: string; importe?: string; general?: string }>({});
  const [hecho, setHecho] = useState<{ creadas: number; existentes: number } | null>(null);
  const { enviando, ejecutar } = useEnvio();

  async function generar() {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) return setErrores({ periodo: 'Elige un mes.' });
    const centimos = parsearSoles(importe);
    if (centimos === null) return setErrores({ importe: 'Escribe un importe mayor que 0, por ejemplo 15.00.' });
    await ejecutar(async () => {
      setErrores({});
      try {
        setHecho(await api.solicitar<{ creadas: number; existentes: number }>('POST', '/v1/cuotas/generar', { periodo, importeCentimos: centimos }));
        alGenerar();
      } catch (err) {
        setErrores({ general: err instanceof ErrorApi && err.estado === 403 ? 'Su rol no puede generar cuotas.' : mensajeDeError(err) });
      }
    });
  }

  if (hecho) {
    const listo = () => { cerrar(); avisar(`Cuotas de ${mesDe(periodo).toLowerCase()}: ${hecho.creadas} creadas`); };
    return (
      <Cajon sobre="Tesorería" titulo="Generar cuotas" texto="Una cuota por asociado activo. Repetirlo no duplica." cerrar={listo} onEnviar={listo} pie={<Bt type="submit" clase="teal">Listo</Bt>}>
        <Final titulo={`Cuotas de ${mesDe(periodo).toLowerCase()}`}>
          <div className="resultado"><div><b>{hecho.creadas}</b><span>creadas</span></div><div><b>{hecho.existentes}</b><span>ya existían</span></div></div>
        </Final>
      </Cajon>
    );
  }
  return (
    <Cajon sobre="Tesorería" titulo="Generar cuotas" texto="Una cuota por asociado activo. Repetirlo no duplica." etiqueta="Generar cuotas del periodo" cerrar={() => { if (!enviando) cerrar(); }} onEnviar={() => void generar()}
      pie={<><Bt clase="borde" disabled={enviando} onClick={cerrar}>Cancelar</Bt><Bt type="submit" clase="teal" disabled={enviando}>{enviando ? 'Generando…' : 'Generar'}</Bt></>}>
      <Campo id="g-mes" etiqueta="Mes" type="month" value={periodo} disabled={enviando} error={errores.periodo} onChange={(e) => setPeriodo(e.target.value)} />
      <Campo id="g-importe" etiqueta="Cuota (S/)" inputMode="decimal" placeholder="15.00" value={importe} disabled={enviando} error={errores.importe} onChange={(e) => setImporte(e.target.value)} />
      <ErrorCajon texto={errores.general ?? null} />
    </Cajon>
  );
}

// ───────────────────────── Revertir un pago ─────────────────────────

export function CajonReversa({ pago, asociado, cerrar, alRevertir }: { pago: VistaPago; asociado: { id: string; nombre: string }; cerrar: () => void; alRevertir: () => void }) {
  const { api } = useApp();
  const avisar = useAvisar();
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [falta, setFalta] = useState(false);
  const [cerrado, setCerrado] = useState(false);
  const { enviando, ejecutar } = useEnvio();

  async function revertir() {
    if (cerrado) return;
    const texto = motivo.trim();
    if (texto.length < 1 || texto.length > 300) return setFalta(true);
    await ejecutar(async () => {
      setError(null);
      try {
        await api.solicitar('POST', `/v1/pagos/${pago.id}/reversa`, { motivo: texto });
        alRevertir();
        cerrar();
        avisar('Pago revertido.', 'revertir');
      } catch (err) {
        if (err instanceof ErrorApi && err.estado === 409) { setError('Este pago ya fue revertido. Revisa el estado de cuenta.'); setCerrado(true); alRevertir(); }
        else if (err instanceof ErrorApi && err.estado === 403) { setError('Su rol no tiene permiso para revertir este pago.'); setCerrado(true); }
        else if (err instanceof ErrorApi && err.estado === 422) { setError('Revisa el motivo e intenta de nuevo.'); setFalta(true); }
        else { setError('No se pudo confirmar la reversa. Revisa el estado del pago antes de intentarlo de nuevo.'); setCerrado(true); alRevertir(); }
      }
    });
  }

  return (
    <Cajon sobre="Tesorería" titulo="Revertir un pago" texto="El pago no se borra: queda como revertido." cerrar={() => { if (!enviando) cerrar(); }} onEnviar={() => void revertir()}
      pie={<><Bt clase="borde" disabled={enviando} onClick={cerrar}>{cerrado ? 'Cerrar' : 'Cancelar'}</Bt>{!cerrado && <Bt type="submit" clase="peligro" disabled={enviando}>{enviando ? 'Revirtiendo…' : 'Revertir pago'}</Bt>}</>}>
      <div className="recibo"><Av id={asociado.id} tam="xl" /><b>{formatearSoles(pago.importeCentimos)}</b><span>{asociado.nombre} · {mesDe(pago.periodo)}</span><small>{pago.comprobante}</small></div>
      <label htmlFor="x-motivo">Motivo (obligatorio)</label>
      <div className={`campo alto ${falta ? 'mal' : ''}`}>
        <textarea id="x-motivo" maxLength={300} value={motivo} disabled={enviando || cerrado} placeholder={falta ? 'Escribe el motivo.' : 'Ejemplo: se registró dos veces'}
          aria-invalid={falta || undefined} aria-describedby="x-motivo-regla" onChange={(e) => { setMotivo(e.target.value); setFalta(false); }} />
      </div>
      {falta && !error && <p className="error" role="alert">Escribe un motivo de 1 a 300 caracteres.</p>}
      <p className="nota" id="x-motivo-regla">Obligatorio · máximo 300 caracteres. Queda registrado para auditoría.</p>
      <ErrorCajon texto={error} />
    </Cajon>
  );
}

// ───────────────────────── Registrar asociado ─────────────────────────

export function CajonNuevoAsociado({ cerrar, alRegistrar }: { cerrar: () => void; alRegistrar: (nombre: string) => void }) {
  const { api } = useApp();
  const [nombre, setNombre] = useState('');
  const [documento, setDocumento] = useState('');
  const [errores, setErrores] = useState<{ nombre?: string; documento?: string; general?: string }>({});
  const { enviando, ejecutar } = useEnvio();

  async function registrar() {
    if (!nombre.trim()) return setErrores({ nombre: 'Escribe el nombre.' });
    if (documento.trim().length < 4) return setErrores({ documento: 'Escribe el DNI (8 números).' });
    await ejecutar(async () => {
      setErrores({});
      try {
        await api.solicitar('POST', '/v1/asociados', { nombre: nombre.trim(), documento: documento.trim() });
        alRegistrar(nombre.trim());
      } catch (err) {
        setErrores({ general: mensajeDeError(err) });
      }
    });
  }

  return (
    <Cajon sobre="Padrón" titulo="Registrar asociado" texto="Nombre y DNI. El avatar se asigna solo." cerrar={() => { if (!enviando) cerrar(); }} onEnviar={() => void registrar()}
      pie={<><Bt clase="borde" disabled={enviando} onClick={cerrar}>Cancelar</Bt><Bt type="submit" clase="teal" disabled={enviando}>{enviando ? 'Registrando…' : 'Registrar'}</Bt></>}>
      <Campo id="a-nombre" name="nombre" etiqueta="Nombre completo" maxLength={120} placeholder="Ejemplo: Marina Condori" value={nombre} disabled={enviando} error={errores.nombre} onChange={(e) => setNombre(e.target.value)} />
      <Campo id="a-dni" name="documento" etiqueta="DNI (8 números)" inputMode="numeric" maxLength={20} placeholder="70000004" value={documento} disabled={enviando} error={errores.documento} onChange={(e) => setDocumento(e.target.value)} />
      <ErrorCajon texto={errores.general ?? null} />
    </Cajon>
  );
}

// ───────────────────────── Quién abre qué ─────────────────────────

export type Pedido =
  | { tipo: 'cuenta'; id: string }
  | { tipo: 'pago'; id: string | null; cuenta?: EstadoDeCuenta }
  | { tipo: 'generar' }
  | { tipo: 'reversa'; pago: VistaPago; asociado: { id: string; nombre: string } }
  | { tipo: 'nuevo' };

/** Muestra el cajón pedido y encadena los pasos (de la cuenta a cobrar o a revertir). */
export function CajonesCaja({ pedido, setPedido, caja, recargar, alCerrarCuenta }: {
  pedido: Pedido | null;
  setPedido: (p: Pedido | null) => void;
  caja: { asociados: ResumenAsociado[]; cuentas: Record<string, EstadoDeCuenta>; totales: { conSaldo: ResumenAsociado[]; importeCuota: number | null } } | null;
  recargar: () => void;
  /** La cuenta abierta desde la dirección se cierra volviendo a la lista. */
  alCerrarCuenta?: () => void;
}) {
  const avisar = useAvisar();
  if (!pedido) return null;
  const salirDeCuenta = () => { if (pedido.tipo === 'cuenta') alCerrarCuenta?.(); };
  const cerrar = () => { salirDeCuenta(); setPedido(null); };
  switch (pedido.tipo) {
    case 'cuenta':
      return <CajonCuenta key={pedido.id} asociadoId={pedido.id} cerrar={cerrar} alCambiar={recargar}
        cobrar={(c) => { salirDeCuenta(); setPedido({ tipo: 'pago', id: c.asociado.id, cuenta: c }); }}
        revertir={(pago, c) => { salirDeCuenta(); setPedido({ tipo: 'reversa', pago, asociado: c.asociado }); }} />;
    case 'pago': {
      const deudores = [...(caja?.totales.conSaldo ?? [])];
      const c = pedido.cuenta;
      if (c && !deudores.some((d) => d.id === c.asociado.id)) deudores.unshift({ ...c.asociado, saldoCentimos: c.saldoCentimos, acceso: c.acceso ?? 'sin-acceso' });
      const cuentas = { ...(caja?.cuentas ?? {}), ...(c ? { [c.asociado.id]: c } : {}) };
      return <CajonPago deudores={deudores} cuentas={cuentas} inicial={pedido.id} cerrar={cerrar} alRegistrar={recargar} />;
    }
    case 'generar':
      return <CajonGenerar importeSugerido={caja?.totales.importeCuota ?? null} cerrar={cerrar} alGenerar={recargar} />;
    case 'reversa':
      return <CajonReversa pago={pedido.pago} asociado={pedido.asociado} cerrar={cerrar} alRevertir={recargar} />;
    case 'nuevo':
      return <CajonNuevoAsociado cerrar={cerrar} alRegistrar={(nombre) => { setPedido(null); avisar(`${nombre} quedó registrado en el padrón.`); recargar(); }} />;
  }
}
