import { useId, useLayoutEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export function Boton({ variante = 'secundario', type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: 'primario' | 'secundario' | 'peligro';
}) {
  return <button {...props} type={type} className={`${variante} ${props.className ?? ''}`} />;
}

export function Aviso({ tipo, children }: { tipo: 'ok' | 'error' | 'advertencia' | 'info'; children: ReactNode }) {
  const clase = { ok: 'exito', error: 'error', advertencia: 'aviso', info: 'info' }[tipo];
  return (
    <p className={clase} role={tipo === 'error' ? 'alert' : 'status'} data-testid={tipo === 'ok' || tipo === 'error' ? `aviso-${tipo}` : undefined}>
      {children}
    </p>
  );
}

export function SinPermiso() {
  return <div data-testid="sin-permiso" className="sin-permiso" role="status"><p>Su rol no tiene acceso a esta sección.</p></div>;
}

export function Carga() {
  return <div className="tarjeta carga" role="status"><span>Cargando…</span><span className="esqueleto" aria-hidden="true" /></div>;
}

export function ErrorConsulta({ error, recargar }: { error: string; recargar: () => void }) {
  return <div className="error-consulta"><Aviso tipo="error">{error}</Aviso><Boton onClick={recargar}>Reintentar consulta</Boton></div>;
}

export function Tabla({ nombre, children }: { nombre: string; children: ReactNode }) {
  return <div className="tabla-envoltorio" role="region" aria-label={nombre} tabIndex={0}>{children}</div>;
}

export function Insignia({ tipo, children }: { tipo: 'ok' | 'advertencia' | 'info' | 'error'; children: ReactNode }) {
  return <span className={`insignia insignia-${tipo}`}>{children}</span>;
}

export function Dialogo({ titulo, cerrar, children }: { titulo: string; cerrar: () => void; children: ReactNode }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const encabezado = useRef<HTMLHeadingElement>(null);
  const tituloId = useId();
  useLayoutEffect(() => {
    const nodo = dialogo.current;
    if (!nodo) return;
    const anterior = document.activeElement;
    if (typeof nodo.showModal === 'function') nodo.showModal();
    else nodo.setAttribute('open', '');
    return () => {
      if (typeof nodo.close === 'function') nodo.close();
      if (anterior instanceof HTMLElement && anterior.isConnected && !nodo.contains(anterior)) anterior.focus();
    };
  }, []);
  useLayoutEffect(() => {
    encabezado.current?.focus();
  }, [titulo]);

  return (
    <dialog ref={dialogo} aria-modal="true" aria-labelledby={tituloId} onCancel={(e) => { e.preventDefault(); cerrar(); }}>
      <h2 ref={encabezado} id={tituloId} tabIndex={-1}>{titulo}</h2>
      {children}
    </dialog>
  );
}
