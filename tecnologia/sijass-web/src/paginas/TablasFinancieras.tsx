import type { ReactNode } from 'react';
import type { VistaCuota, VistaPago } from '../api/tipos';
import { fechaPago, formatearSoles } from '../lib/dinero';
import { Insignia, Tabla } from '../ui';

interface Columna<T> {
  nombre: string;
  clase?: string;
  mostrar: (fila: T) => ReactNode;
}

function TablaFinanciera<T extends { id: string }>({ id, nombre, filas, columnas, mensajeSinDatos, idFila }: {
  id: string;
  nombre: string;
  filas: T[];
  columnas: Columna<T>[];
  mensajeSinDatos: string;
  idFila?: (fila: T) => string;
}) {
  return (
    <Tabla nombre={nombre}>
      <table className="tabla-financiera" role="table" data-testid={id}>
        <thead role="rowgroup">
          <tr role="row">
            {columnas.map((columna) => <th key={columna.nombre} role="columnheader" scope="col" className={columna.clase}>{columna.nombre}</th>)}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {filas.map((fila) => (
            <tr role="row" key={fila.id} data-testid={idFila?.(fila)}>
              {columnas.map((columna) => (
                <td role="cell" key={columna.nombre} className={columna.clase}>
                  <span className="etiqueta-compacta" aria-hidden="true">{columna.nombre}</span>
                  <span>{columna.mostrar(fila)}</span>
                </td>
              ))}
            </tr>
          ))}
          {filas.length === 0 && <tr role="row"><td role="cell" colSpan={columnas.length} className="suave">{mensajeSinDatos}</td></tr>}
        </tbody>
      </table>
    </Tabla>
  );
}

export function EstadoPago({ estado }: { estado: VistaPago['estado'] }) {
  return <Insignia tipo={estado === 'vigente' ? 'ok' : 'advertencia'}>{estado === 'vigente' ? 'Vigente' : 'Revertido'}</Insignia>;
}

export function TablaCuotas({ cuotas, portal = false }: { cuotas: VistaCuota[]; portal?: boolean }) {
  const columnas: Columna<VistaCuota>[] = [
    { nombre: 'Periodo', mostrar: (c) => c.periodo },
    { nombre: 'Importe', clase: 'num', mostrar: (c) => formatearSoles(c.importeCentimos) },
  ];
  if (!portal) columnas.push({ nombre: 'Pagado', clase: 'num', mostrar: (c) => formatearSoles(c.pagadoCentimos) });
  columnas.push(
    { nombre: 'Pendiente', clase: 'num', mostrar: (c) => formatearSoles(c.pendienteCentimos) },
    { nombre: 'Estado', mostrar: (c) =>
      <Insignia tipo={c.estado === 'pagada' ? 'ok' : 'advertencia'}>{c.estado === 'pagada' ? 'Pagada' : c.estado === 'parcial' ? 'Pago parcial' : 'Pendiente'}</Insignia> },
  );
  return <TablaFinanciera id={portal ? 'portal-cuotas' : 'tabla-cuotas'} nombre="Cuotas del asociado" filas={cuotas} columnas={columnas}
    mensajeSinDatos={portal ? 'Todavía no tiene cuotas.' : 'Sin cuotas todavía.'} />;
}

export function HistorialPagos({ pagos, acciones }: { pagos: VistaPago[]; acciones?: (p: VistaPago) => ReactNode }) {
  const columnas: Columna<VistaPago>[] = [
    { nombre: 'Fecha', mostrar: (p) => fechaPago(p.pagadoEn) },
    { nombre: 'Periodo', mostrar: (p) => p.periodo },
    { nombre: 'Comprobante', mostrar: (p) => p.comprobante },
    { nombre: 'Importe', clase: 'num', mostrar: (p) => formatearSoles(p.importeCentimos) },
    { nombre: 'Estado', mostrar: (p) => <EstadoPago estado={p.estado} /> },
  ];
  if (acciones) columnas.push({ nombre: 'Acciones', clase: 'acciones', mostrar: acciones });
  return <TablaFinanciera id={acciones ? 'tabla-pagos' : 'portal-pagos'} nombre="Historial de pagos" filas={pagos} columnas={columnas}
    idFila={(p) => `${acciones ? '' : 'portal-'}pago-${p.comprobante}`}
    mensajeSinDatos={acciones ? 'Sin pagos registrados.' : 'Todavía no tiene pagos registrados.'} />;
}
