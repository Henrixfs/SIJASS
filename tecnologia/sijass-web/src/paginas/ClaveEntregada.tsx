import { useState } from 'react';
import { Copy, Printer } from 'lucide-react';
import { Aviso, Boton, Dialogo } from '../ui';
import './clave.css';

/**
 * Entrega de una clave temporal (spec `interfaz-acceso-y-administracion`): se muestra una sola
 * vez, en letra grande, con DNI y nombre, y se puede copiar o imprimir en una tarjeta. La clave
 * vive solo en el estado de este diálogo: al cerrarlo se desmonta y desaparece; nunca se guarda
 * en el almacenamiento del navegador.
 */
export function ClaveEntregada({ titulo, nombre, documento, clave, cerrar }: {
  titulo: string;
  nombre: string;
  /** Si se conoce, el DNI (completo o enmascarado) de la persona. */
  documento?: string | null;
  clave: string;
  cerrar: () => void;
}) {
  const [copia, setCopia] = useState<'ninguna' | 'copiada' | 'fallo'>('ninguna');

  async function copiar() {
    try {
      await navigator.clipboard.writeText(clave);
      setCopia('copiada');
    } catch {
      setCopia('fallo');
    }
  }

  return (
    <Dialogo titulo={titulo} cerrar={cerrar}>
      <div className="entrega-clave">
        <p>
          Entrega esta clave a <strong>{nombre}</strong>{documento ? <> (DNI {documento})</> : null}. Podrá entrar con su DNI y esta clave.
        </p>
        <p className="clave-grande" data-testid="clave-temporal" role="group" aria-label="Clave temporal">{clave}</p>
        <div className="acciones-clave">
          <Boton onClick={() => void copiar()}><Copy size={16} aria-hidden="true" /> Copiar</Boton>
          <Boton onClick={() => window.print()}><Printer size={16} aria-hidden="true" /> Imprimir tarjeta</Boton>
        </div>
        {copia === 'copiada' && <p role="status" className="suave">Clave copiada.</p>}
        {copia === 'fallo' && <p role="status" className="suave">No se pudo copiar. Escríbela tal como está.</p>}
        <Aviso tipo="advertencia">Esta clave no se podrá ver de nuevo. Entrégala en persona y, si imprimes la tarjeta, destrúyela después.</Aviso>
        <div className="tarjeta-impresa" aria-hidden="true">
          <h3>SIJASS · Tu acceso</h3>
          <dl>
            <dt>Nombre</dt><dd>{nombre}</dd>
            {documento ? <><dt>DNI</dt><dd>{documento}</dd></> : null}
            <dt>Clave</dt><dd className="clave-impresa">{clave}</dd>
          </dl>
          <p>Entra con tu DNI y esta clave. Escríbela tal como está. No la compartas.</p>
        </div>
        <div className="pie-dialogo"><Boton variante="primario" onClick={cerrar}>Listo</Boton></div>
      </div>
    </Dialogo>
  );
}
