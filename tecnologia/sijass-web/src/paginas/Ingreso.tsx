import { useRef, useState, type FormEvent } from 'react';
import { ErrorApi, ErrorTipoDeAcceso, type TipoDeAcceso } from '../api/cliente';
import { mensajeDeError, useApp } from '../contexto';
import { inicioDe } from '../lib/rutas';
import { useEnvio } from '../hooks';
import { LagunaViva } from '../altiplano/LagunaViva';
import { FOTOS } from '../lib/fotos';
import { Av, Ic } from '../v3/base';
import { oleada } from '../v3/oleada';

const TIPOS: Array<{ id: TipoDeAcceso; titulo: string; detalle: string }> = [
  { id: 'asociado', titulo: 'Soy asociado', detalle: 'Consulto mis cuotas y mis pagos' },
  { id: 'administrador', titulo: 'Soy administrador', detalle: 'Gestiono mi JASS' },
];

const NOMBRE_TIPO: Record<TipoDeAcceso, string> = { asociado: 'Soy asociado', administrador: 'Soy administrador' };

type Estado =
  | { tipo: 'verificando' }
  | { tipo: 'error'; titulo: string; detalle: string; otroTipo?: TipoDeAcceso }
  | { tipo: 'bloqueado' }
  | { tipo: 'suspendida' }
  | { tipo: 'ok' };

function EstadoAcceso({ estado, cambiarTipo }: { estado: Estado; cambiarTipo: (t: TipoDeAcceso) => void }) {
  const cfg = {
    verificando: { clase: 'info', titulo: 'Verificando credenciales…', detalle: 'El botón de ingreso queda temporalmente deshabilitado.' },
    error: { clase: 'error', titulo: estado.tipo === 'error' ? estado.titulo : '', detalle: estado.tipo === 'error' ? estado.detalle : '' },
    bloqueado: { clase: 'aviso', titulo: 'Acceso temporalmente bloqueado', detalle: 'Vuelve a intentarlo en 15 minutos.' },
    suspendida: { clase: 'aviso', titulo: 'Tu JASS está suspendida', detalle: 'Comunícate con SIJASS para volver a usar el sistema.' },
    ok: { clase: 'exito', titulo: 'Sesión iniciada', detalle: 'Abriendo tu espacio en SIJASS.' },
  }[estado.tipo];
  const esError = estado.tipo === 'error' || estado.tipo === 'bloqueado' || estado.tipo === 'suspendida';
  return (
    <div className={`estado-ingreso ${cfg.clase}`} role={esError ? 'alert' : 'status'} data-testid={esError ? 'error-ingreso' : undefined}>
      <strong>{cfg.titulo}</strong>
      <span>{cfg.detalle}</span>
      {estado.tipo === 'error' && estado.otroTipo && (
        <button type="button" onClick={() => cambiarTipo(estado.otroTipo as TipoDeAcceso)}>Usar «{NOMBRE_TIPO[estado.otroTipo]}»</button>
      )}
    </div>
  );
}

/** Ingreso (maqueta v3): la laguna con agua viva, el titular y la tarjeta de vidrio en dos pasos. */
export function Ingreso({ expirada }: { expirada: boolean }) {
  const { api, navegar } = useApp();
  const [tipo, setTipo] = useState<TipoDeAcceso | null>(null);
  const [documento, setDocumento] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [visible, setVisible] = useState(false);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [errorDocumento, setErrorDocumento] = useState<string | null>(null);
  const campoDocumento = useRef<HTMLInputElement>(null);
  const { enviando, ejecutar } = useEnvio();

  function elegir(nuevo: TipoDeAcceso) {
    setTipo(nuevo);
    setEstado(null);
    window.setTimeout(() => campoDocumento.current?.focus({ preventScroll: true }), 0);
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (tipo === null) return;
    if (!/^[0-9]{8}$/.test(documento)) {
      setErrorDocumento('El DNI tiene 8 números.');
      campoDocumento.current?.focus();
      return;
    }
    setErrorDocumento(null);
    await ejecutar(async () => {
      setEstado({ tipo: 'verificando' });
      try {
        const s = await api.iniciarSesion(documento, contrasena, tipo);
        setEstado({ tipo: 'ok' });
        // La pantalla cambia ya; la oleada solo acompaña (si esperara, desharía el primer toque de la persona).
        navegar(inicioDe(s.perfil));
        oleada();
      } catch (err) {
        if (err instanceof ErrorTipoDeAcceso) {
          setEstado({
            tipo: 'error',
            titulo: 'Elegiste el otro botón',
            detalle: err.tipoReal === 'asociado' ? 'Tu cuenta es de asociado. Entra con «Soy asociado».' : 'Tu cuenta es de administración. Entra con «Soy administrador».',
            otroTipo: err.tipoReal,
          });
        } else if (err instanceof ErrorApi && err.estado === 429) setEstado({ tipo: 'bloqueado' });
        else if (err instanceof ErrorApi && err.estado === 403 && err.codigo === 'jass-suspendida') setEstado({ tipo: 'suspendida' });
        else if (err instanceof ErrorApi && err.estado === 401) {
          setEstado({ tipo: 'error', titulo: 'Datos de acceso incorrectos', detalle: 'Revisa tu DNI y tu clave e inténtalo de nuevo.' });
        } else setEstado({ tipo: 'error', titulo: 'No pudimos iniciar tu sesión', detalle: mensajeDeError(err) });
      }
    });
  }

  return (
    <div className="v3">
      <main className="esc-ingreso">
        <LagunaViva foto={FOTOS.llanganuco} className="fondo-ingreso" />
        <div className="velo" />
        <div className="arriba"><div className="marca"><span className="gota"><Ic n="gota" /></span>SIJASS</div></div>
        <div className="mensaje">
          <span className="kicker"><Ic n="gota" />Gestión de agua comunitaria</span>
          <p className="lema"><span className="linea"><span>El agua de tu</span></span> <span className="linea"><span>comunidad,</span></span> <span className="linea"><span>en orden.</span></span></p>
          <p className="sub">Cuotas, pagos y la calidad del agua de tu JASS en un solo lugar. Toca la laguna.</p>
        </div>
        <p className="credito">Foto: Lagunas de Llanganuco · PsamatheM · CC BY-SA 4.0 · Wikimedia Commons</p>
        <form className="cristal" onSubmit={enviar} aria-labelledby="titulo-ingreso" noValidate>
          {tipo === null ? (
            <div className="paso izq">
              <h1 id="titulo-ingreso">Iniciar sesión</h1>
              {expirada && !estado && <EstadoAcceso estado={{ tipo: 'error', titulo: 'Tu sesión expiró', detalle: 'Vuelve a ingresar para continuar.' }} cambiarTipo={elegir} />}
              <p className="q">¿Cómo vas a entrar?</p>
              <div role="group" aria-label="¿Cómo vas a entrar?">
                {TIPOS.map(({ id, titulo, detalle }) => (
                  <button key={id} type="button" className="tipo tipo-acceso" onClick={() => elegir(id)}>
                    <Av indice={id === 'asociado' ? 0 : 3} tam="l" insignia={id === 'administrador' ? 'shield' : undefined} />
                    <span><strong>{titulo}</strong><small>{detalle}</small></span>
                    <Ic n="flecha" className="ir" />
                  </button>
                ))}
              </div>
              <p className="ayuda">¿Necesitas ayuda? <b>Contacta a tu JASS.</b></p>
            </div>
          ) : (
            <div className="paso der">
              <h1 id="titulo-ingreso">Iniciar sesión</h1>
              <div className="elegido"><span data-testid="tipo-elegido">{NOMBRE_TIPO[tipo]}</span><button type="button" onClick={() => { setTipo(null); setEstado(null); }}>Cambiar</button></div>
              <label htmlFor="documento-ingreso">Número de DNI</label>
              <div className={`campo ${errorDocumento ? 'mal' : ''}`}>
                <Ic n="users" />
                <input id="documento-ingreso" ref={campoDocumento} name="documento" inputMode="numeric" pattern="[0-9]*" maxLength={8} autoComplete="username"
                  placeholder="8 números" aria-invalid={errorDocumento !== null} aria-describedby={errorDocumento ? 'error-documento' : undefined}
                  value={documento} onChange={(e) => { setDocumento(e.target.value.replace(/\D/g, '')); setErrorDocumento(null); }} />
              </div>
              {errorDocumento && <span id="error-documento" className="error-campo" role="alert">{errorDocumento}</span>}
              <label htmlFor="clave-ingreso">Clave</label>
              <div className="campo">
                <Ic n="candado" />
                <input id="clave-ingreso" name="contrasena" type={visible ? 'text' : 'password'} placeholder="Escribe tu clave" autoComplete="current-password"
                  autoCapitalize="none" autoCorrect="off" spellCheck={false} required aria-describedby="ayuda-clave" value={contrasena} onChange={(e) => setContrasena(e.target.value)} />
                <button className="ver-clave" type="button" aria-label={visible ? 'Ocultar clave' : 'Mostrar clave'} aria-controls="clave-ingreso" aria-pressed={visible} onClick={() => setVisible(!visible)}>
                  <Ic n="ojo" />
                </button>
              </div>
              <p id="ayuda-clave" className="ayuda-c">Si te la entregaron en una tarjeta, escríbela tal como está.</p>
              {estado && <EstadoAcceso estado={estado} cambiarTipo={elegir} />}
              <button type="submit" className="bt teal entrar boton-ingreso" disabled={enviando}>{enviando ? 'Ingresando…' : 'Ingresar'} <Ic n="flecha" /></button>
              <p className="ayuda">¿Necesitas ayuda? <b>Contacta a tu JASS.</b></p>
            </div>
          )}
        </form>
      </main>
    </div>
  );
}
