import { useRef, useState, type FormEvent } from 'react';
import { ErrorApi, ErrorTipoDeAcceso, type TipoDeAcceso } from '../api/cliente';
import { mensajeDeError, useApp } from '../contexto';
import { inicioDe } from '../lib/rutas';
import { useEnvio } from '../hooks';
import { Check, Clock, Eye, EyeOff, ShieldCheck, TriangleAlert, UsersRound } from 'lucide-react';
import { Marca } from '../identidad';
import './ingreso.css';

const TIPOS: Array<{ id: TipoDeAcceso; titulo: string; detalle: string; Icono: typeof UsersRound }> = [
  { id: 'asociado', titulo: 'Soy asociado', detalle: 'Consulto mis cuotas y mis pagos.', Icono: UsersRound },
  { id: 'administrador', titulo: 'Soy administrador', detalle: 'Gestiono mi JASS.', Icono: ShieldCheck },
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
    verificando: { clase: 'info', Icono: Clock, titulo: 'Verificando credenciales…', detalle: 'El botón de ingreso queda temporalmente deshabilitado.' },
    error: { clase: 'error', Icono: TriangleAlert, titulo: estado.tipo === 'error' ? estado.titulo : '', detalle: estado.tipo === 'error' ? estado.detalle : '' },
    bloqueado: { clase: 'aviso', Icono: TriangleAlert, titulo: 'Acceso temporalmente bloqueado', detalle: 'Vuelve a intentarlo en 15 minutos.' },
    suspendida: { clase: 'aviso', Icono: TriangleAlert, titulo: 'Tu JASS está suspendida', detalle: 'Comunícate con SIJASS para volver a usar el sistema.' },
    ok: { clase: 'exito', Icono: Check, titulo: 'Sesión iniciada', detalle: 'Abriendo tu espacio en SIJASS.' },
  }[estado.tipo];
  const { Icono } = cfg;
  const esError = estado.tipo === 'error' || estado.tipo === 'bloqueado' || estado.tipo === 'suspendida';
  return (
    <div className={`estado-acceso ${cfg.clase}`} role={esError ? 'alert' : 'status'} data-testid={esError ? 'error-ingreso' : undefined}>
      <span className="estado-icono"><Icono size={18} aria-hidden="true" /></span>
      <div>
        <strong>{cfg.titulo}</strong>
        <span>{cfg.detalle}</span>
        {estado.tipo === 'error' && estado.otroTipo && (
          <button type="button" className="enlace-tipo" onClick={() => cambiarTipo(estado.otroTipo as TipoDeAcceso)}>Usar «{NOMBRE_TIPO[estado.otroTipo]}»</button>
        )}
      </div>
    </div>
  );
}

function Ondas() {
  return (
    <svg className="ondas" viewBox="0 0 642 340" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
      <path d="M0 270 C90 250 150 240 215 210 C285 178 320 120 392 112 C470 104 560 112 642 20 V340 H0 Z" fill="#0c4a58" fillOpacity=".78" />
      <path d="M0 300 C100 280 170 280 240 245 C310 210 345 150 420 142 C500 134 580 140 642 70 V340 H0 Z" fill="#12606a" fillOpacity=".62" />
      <path d="M0 330 C110 310 200 318 290 285 C370 255 410 205 480 198 C550 192 600 196 642 150 V340 H0 Z" fill="#146a73" fillOpacity=".5" />
      <g fill="none" stroke="#2cc5ae" strokeLinecap="round">
        <path d="M0 272 C90 252 150 242 215 212 C285 180 320 122 392 114 C470 106 560 114 642 22" strokeWidth="2" />
        <path d="M0 302 C100 282 170 282 240 247 C310 212 345 152 420 144 C500 136 580 142 642 72" strokeWidth="1.2" strokeOpacity=".7" />
        <path d="M0 332 C110 312 200 320 290 287 C370 257 410 207 480 200 C550 194 600 198 642 152" strokeWidth="1" strokeOpacity=".45" />
      </g>
      <circle cx="328" cy="156" r="14" fill="#2cc5ae" fillOpacity=".18" />
      <circle cx="328" cy="156" r="5" fill="#44e0c4" />
      <circle cx="523" cy="133" r="4" fill="#9af0dd" />
    </svg>
  );
}

export function Ingreso({ expirada }: { expirada: boolean }) {
  const { api, navegar } = useApp();
  const [tipo, setTipo] = useState<TipoDeAcceso | null>(null);
  const [documento, setDocumento] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [visible, setVisible] = useState(false);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [errorDocumento, setErrorDocumento] = useState<string | null>(null);
  // Hacia dónde avanza el paso: «adelante» al elegir el tipo de acceso, «atras» al pulsar «Cambiar».
  const [sentido, setSentido] = useState<'adelante' | 'atras'>('adelante');
  // El primer paso no se anima al cargar (ya entra con la tarjeta): solo los cambios de paso.
  const [navegado, setNavegado] = useState(false);
  const campoDocumento = useRef<HTMLInputElement>(null);
  const { enviando, ejecutar } = useEnvio();

  function elegir(nuevo: TipoDeAcceso) {
    setSentido('adelante');
    setNavegado(true);
    setTipo(nuevo);
    setEstado(null);
    window.setTimeout(() => campoDocumento.current?.focus(), 0);
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
        navegar(inicioDe(s.perfil));
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
    <main className="ingreso">
      <section className="ingreso-marca" aria-label="SIJASS">
        <div className="ingreso-marca-contenido">
          <div className="firma-ingreso"><Marca /><span>Gestión de agua comunitaria</span></div>
          <div className="mensaje-ingreso">
            <span className="ingreso-etiqueta">Tu espacio en SIJASS</span>
            <p className="lema-ingreso">Gestiona el agua de tu comunidad</p>
            <p className="lema-detalle">Consulta tus cuotas o administra el servicio de tu JASS.</p>
          </div>
          <p className="titulo-movil">Gestión de agua comunitaria</p>
          <p className="lema-movil">Acceso para personal y familias</p>
        </div>
        <Ondas />
      </section>
      <div className="ingreso-formulario">
        <form className="ingreso-tarjeta" onSubmit={enviar} aria-labelledby="titulo-ingreso" noValidate>
          <h1 id="titulo-ingreso">Iniciar sesión</h1>
          {expirada && !estado && tipo === null && <EstadoAcceso estado={{ tipo: 'error', titulo: 'Tu sesión expiró', detalle: 'Vuelve a ingresar para continuar.' }} cambiarTipo={elegir} />}

          {tipo === null ? (
            <div key="paso-tipo" className="paso-ingreso" data-sentido={navegado ? sentido : 'inicial'}>
              <p className="descripcion-ingreso">¿Cómo vas a entrar?</p>
              <div className="tipos-acceso" role="group" aria-label="¿Cómo vas a entrar?">
                {TIPOS.map(({ id, titulo, detalle, Icono }) => (
                  <button key={id} type="button" className="tipo-acceso" onClick={() => elegir(id)}>
                    <span className="tipo-icono"><Icono size={26} aria-hidden="true" /></span>
                    <span className="tipo-texto"><strong>{titulo}</strong><small>{detalle}</small></span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div key="paso-datos" className="paso-ingreso" data-sentido={navegado ? sentido : 'inicial'}>
              <p className="descripcion-ingreso">
                <span className="tipo-elegido" data-testid="tipo-elegido">{NOMBRE_TIPO[tipo]}</span>
                <button type="button" className="enlace-tipo" onClick={() => { setSentido('atras'); setNavegado(true); setTipo(null); setEstado(null); }}>Cambiar</button>
              </p>
              <div className="campo-ingreso">
                <label className="etiqueta-ingreso" htmlFor="documento-ingreso">Número de DNI</label>
                <input
                  id="documento-ingreso" ref={campoDocumento} name="documento" inputMode="numeric" pattern="[0-9]*" maxLength={8} autoComplete="username"
                  placeholder="8 números" aria-invalid={errorDocumento !== null} aria-describedby={errorDocumento ? 'error-documento' : undefined}
                  value={documento} onChange={(e) => { setDocumento(e.target.value.replace(/\D/g, '')); setErrorDocumento(null); }}
                />
                {errorDocumento && <span id="error-documento" className="error-campo" role="alert">{errorDocumento}</span>}
              </div>
              <div className="campo-ingreso">
                <label className="etiqueta-ingreso" htmlFor="clave-ingreso">Clave</label>
                <span className="campo-clave">
                  <input
                    id="clave-ingreso" name="contrasena" type={visible ? 'text' : 'password'} placeholder="Escribe tu clave" autoComplete="current-password"
                    autoCapitalize="none" autoCorrect="off" spellCheck={false} required aria-describedby="ayuda-clave" value={contrasena} onChange={(e) => setContrasena(e.target.value)}
                  />
                  <button className="ver-clave" type="button" aria-label={visible ? 'Ocultar clave' : 'Mostrar clave'} aria-controls="clave-ingreso" aria-pressed={visible} onClick={() => setVisible(!visible)}>
                    {visible ? <EyeOff aria-hidden="true" size={20} /> : <Eye aria-hidden="true" size={20} />}
                  </button>
                </span>
                <small id="ayuda-clave" className="ayuda-campo">Si te la entregaron en una tarjeta, escríbela tal como está.</small>
              </div>
              {estado && <EstadoAcceso estado={estado} cambiarTipo={elegir} />}
              <button type="submit" className="primario boton-ingreso" disabled={enviando}>{enviando ? 'Ingresando…' : 'Ingresar'}</button>
            </div>
          )}
          <p className="ayuda-ingreso"><span>¿Necesitas ayuda?</span> <strong>Contacta a tu JASS.</strong></p>
        </form>
      </div>
    </main>
  );
}
