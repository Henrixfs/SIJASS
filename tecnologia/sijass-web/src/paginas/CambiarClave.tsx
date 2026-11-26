import { useId, useRef, useState, type FormEvent } from 'react';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { ErrorApi } from '../api/cliente';
import { mensajeDeError, useApp } from '../contexto';
import { useEnvio } from '../hooks';
import { Marca } from '../identidad';
import { Aviso, Boton, Dialogo } from '../ui';
import './clave.css';

/** Mínimo y máximo de la política de claves elegidas por una persona (spec `acceso-por-documento`). */
const MINIMO = 10;
const MAXIMO = 128;

interface Errores {
  actual?: string;
  nueva?: string;
  confirmacion?: string;
  general?: string;
}

function Formulario({ obligatorio, alTerminar, cancelar }: { obligatorio: boolean; alTerminar?: () => void; cancelar?: () => void }) {
  const { api } = useApp();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [visible, setVisible] = useState(false);
  const [errores, setErrores] = useState<Errores>({});
  const { enviando, ejecutar } = useEnvio();
  const id = useId();
  const refActual = useRef<HTMLInputElement>(null);
  const refNueva = useRef<HTMLInputElement>(null);
  const refConfirmacion = useRef<HTMLInputElement>(null);
  const tipo = visible ? 'text' : 'password';
  const atributos = { autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false } as const;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const nuevos: Errores = {};
    if (actual === '') nuevos.actual = obligatorio ? 'Escribe la clave que te entregaron.' : 'Escribe tu clave actual.';
    if (nueva.length < MINIMO || nueva.length > MAXIMO) nuevos.nueva = `La clave nueva debe tener entre ${MINIMO} y ${MAXIMO} caracteres.`;
    else if (confirmacion !== nueva) nuevos.confirmacion = 'Las dos claves no son iguales.';
    setErrores(nuevos);
    const primero = nuevos.actual ? refActual : nuevos.nueva ? refNueva : nuevos.confirmacion ? refConfirmacion : null;
    if (primero) {
      primero.current?.focus();
      return;
    }
    await ejecutar(async () => {
      try {
        await api.cambiarContrasena(actual, nueva);
        alTerminar?.();
      } catch (err) {
        if (err instanceof ErrorApi && err.estado === 401) setErrores({ actual: 'La clave actual no es correcta.' });
        else if (err instanceof ErrorApi && err.estado === 422) setErrores({ nueva: 'Esa clave no sirve. Usa 10 o más caracteres y que no sea tu DNI.' });
        else if (err instanceof ErrorApi && err.estado === 429) setErrores({ general: 'Demasiados intentos. Vuelve a intentarlo en 15 minutos.' });
        else setErrores({ general: mensajeDeError(err) });
      }
    });
  }

  return (
    <form className="formulario-clave" onSubmit={enviar} noValidate aria-label="Cambiar clave">
      <div className="campo-clave-cambio">
        <label htmlFor={`${id}-campo-actual`}>{obligatorio ? 'Clave que te entregaron' : 'Clave actual'}</label>
        <input id={`${id}-campo-actual`} ref={refActual} name="clave-actual" type={tipo} autoComplete="current-password" {...atributos} value={actual} onChange={(e) => setActual(e.target.value)}
          aria-invalid={!!errores.actual} aria-describedby={errores.actual ? `${id}-actual` : undefined} />
        {errores.actual && <span id={`${id}-actual`} className="error-campo" role="alert">{errores.actual}</span>}
      </div>
      <div className="campo-clave-cambio">
        <label htmlFor={`${id}-campo-nueva`}>Clave nueva</label>
        <input id={`${id}-campo-nueva`} ref={refNueva} name="clave-nueva" type={tipo} autoComplete="new-password" {...atributos} value={nueva} onChange={(e) => setNueva(e.target.value)}
          aria-invalid={!!errores.nueva} aria-describedby={`${id}-ayuda${errores.nueva ? ` ${id}-nueva` : ''}`} />
        <small id={`${id}-ayuda`} className="ayuda-campo">Mínimo 10 letras o números. Puede ser una frase fácil de recordar, como «mi casa tiene tres ventanas».</small>
        {errores.nueva && <span id={`${id}-nueva`} className="error-campo" role="alert">{errores.nueva}</span>}
      </div>
      <div className="campo-clave-cambio">
        <label htmlFor={`${id}-campo-conf`}>Repite la clave nueva</label>
        <input id={`${id}-campo-conf`} ref={refConfirmacion} name="clave-confirmacion" type={tipo} autoComplete="new-password" {...atributos} value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)}
          aria-invalid={!!errores.confirmacion} aria-describedby={errores.confirmacion ? `${id}-conf` : undefined} />
        {errores.confirmacion && <span id={`${id}-conf`} className="error-campo" role="alert">{errores.confirmacion}</span>}
      </div>
      <button type="button" className="mostrar-claves" aria-pressed={visible} onClick={() => setVisible(!visible)}>
        {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}{visible ? 'Ocultar las claves' : 'Mostrar las claves'}
      </button>
      {errores.general && <Aviso tipo="error">{errores.general}</Aviso>}
      <div className="pie-formulario-clave">
        {cancelar && <Boton onClick={cancelar} disabled={enviando}>Cancelar</Boton>}
        <Boton type="submit" variante="primario" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar mi clave'}</Boton>
      </div>
    </form>
  );
}

/**
 * Cambio de clave. `obligatorio` es la pantalla única del primer ingreso del personal (spec
 * `interfaz-acceso-y-administracion`); sin él es el diálogo voluntario del perfil.
 */
export function CambiarClave({ obligatorio = false, cerrar }: { obligatorio?: boolean; cerrar?: () => void }) {
  const { salir } = useApp();
  const { enviando, ejecutar } = useEnvio();
  if (!obligatorio) {
    return (
      <Dialogo titulo="Cambiar mi clave" cerrar={() => cerrar?.()}>
        <Formulario obligatorio={false} alTerminar={cerrar} cancelar={cerrar} />
      </Dialogo>
    );
  }
  return (
    <main className="pagina-clave">
      <section className="tarjeta-clave" aria-labelledby="titulo-clave">
        <Marca />
        <span className="sello-clave"><KeyRound size={22} aria-hidden="true" /></span>
        <h1 id="titulo-clave" tabIndex={-1}>Elige tu clave</h1>
        <p className="suave">Es tu primer ingreso. Cambia la clave que te entregaron por una que solo tú conozcas.</p>
        <Formulario obligatorio />
        <button type="button" className="salir-clave" disabled={enviando} onClick={() => void ejecutar(salir)}>Salir</button>
      </section>
    </main>
  );
}
