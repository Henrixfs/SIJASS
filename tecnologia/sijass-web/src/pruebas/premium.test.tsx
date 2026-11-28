import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Importe } from '../Importe';
import { formatearSoles } from '../lib/dinero';
import type { EstadoDeCuenta, ResumenAsociado } from '../api/tipos';
import { calcularTotales, cuando, mesDe, saludo, valorCloro } from '../v3/datos';
import { Gotas } from '../v3/base';

const asociado = (id: string, saldoCentimos: number, estado: 'activo' | 'baja' = 'activo'): ResumenAsociado =>
  ({ id, nombre: id, documento: id, estado, saldoCentimos, acceso: 'activo' });
const cuota = (id: string, periodo: string, pagado: number) =>
  ({ id, periodo, importeCentimos: 1500, pagadoCentimos: pagado, pendienteCentimos: 1500 - pagado, estado: pagado >= 1500 ? 'pagada' as const : pagado ? 'parcial' as const : 'pendiente' as const });
const cuenta = (id: string, cuotas: ReturnType<typeof cuota>[], pagos: EstadoDeCuenta['pagos'] = []): EstadoDeCuenta => ({
  asociado: { id, nombre: id, documento: id, estado: 'activo' }, saldoCentimos: cuotas.reduce((s, c) => s + c.pendienteCentimos, 0), periodoActual: '2026-11', cuotas, pagos,
});

describe('cifras de la caja (todas salen de los estados de cuenta)', () => {
  it('emitido, cobrado, pendiente, porcentaje y cobranza por mes', () => {
    const a = [asociado('rosa', 0), asociado('luis', 2250), asociado('ana', 4500)];
    const pago = (id: string, periodo: string, importe: number, dia: string) => ({ id, cuotaId: id, periodo, importeCentimos: importe, pagadoEn: `2026-11-${dia}T19:44:00Z`, comprobante: id, estado: 'vigente' as const });
    const cuentas = {
      rosa: cuenta('rosa', [cuota('r9', '2026-09', 1500), cuota('r10', '2026-10', 1500), cuota('r11', '2026-11', 1500)], [pago('p1', '2026-09', 1500, '20'), pago('p2', '2026-11', 1500, '25')]),
      luis: cuenta('luis', [cuota('l9', '2026-09', 1500), cuota('l10', '2026-10', 750), cuota('l11', '2026-11', 0)]),
      ana: cuenta('ana', [cuota('a9', '2026-09', 0), cuota('a10', '2026-10', 0), cuota('a11', '2026-11', 0)]),
    };
    const t = calcularTotales(a, cuentas);
    expect(t.emitido).toBe(13500);
    expect(t.pendiente).toBe(6750);
    expect(t.cobrado).toBe(6750);
    expect(t.pct).toBe(50);
    expect(t.porMes).toEqual([
      { periodo: '2026-09', emitido: 4500, cobrado: 3000 },
      { periodo: '2026-10', emitido: 4500, cobrado: 2250 },
      { periodo: '2026-11', emitido: 4500, cobrado: 1500 },
    ]);
    expect(t.conSaldo.map((x) => x.id)).toEqual(['luis', 'ana']);
    expect(t.pagos.map((p) => p.id)).toEqual(['p2', 'p1']);
    expect(t.importeCuota).toBe(1500);
  });

  it('sin estados de cuenta el pendiente sale del padrón y no se inventa lo emitido', () => {
    const t = calcularTotales([asociado('a', 1500), asociado('b', 4500), asociado('c', 0, 'baja')], {});
    expect(t).toMatchObject({ emitido: 0, cobrado: 0, pendiente: 6000, pct: 0, porMes: [], importeCuota: null });
  });
});

describe('textos de fecha y valores', () => {
  const ahora = new Date('2026-11-26T22:30:00Z'); // 5:30 p. m. en Lima
  it('cuándo: hoy, ayer o la fecha, en hora de Lima', () => {
    expect(cuando('2026-11-26T19:01:00Z', false, ahora)).toBe('hoy, 2:01 p. m.');
    expect(cuando('2026-11-25T22:01:00Z', false, ahora)).toBe('ayer, 5:01 p. m.');
    expect(cuando('2026-11-23T13:05:00Z', true, ahora)).toBe('23 nov');
    expect(cuando('2026-11-27T03:00:00Z', true, ahora)).toBe('hoy');
  });
  it('saludo según la hora de Lima, mes y valor de cloro tal como se anotó', () => {
    expect(saludo(ahora)).toBe('Buenas tardes');
    expect(saludo(new Date('2026-11-26T14:00:00Z'))).toBe('Buenos días');
    expect(mesDe('2026-09')).toBe('Septiembre');
    expect(valorCloro(0.65)).toBe('0.65');
    expect(valorCloro(0.8)).toBe('0.8');
  });
});

it('cada mes es una gota con su estado escrito (llena, a medias o vacía)', () => {
  render(<Gotas cuotas={[cuota('c3', '2026-11', 0), cuota('c1', '2026-09', 1500), cuota('c2', '2026-10', 750)]} />);
  expect(screen.getAllByRole('img').map((g) => g.getAttribute('aria-label'))).toEqual(['Septiembre: pagado', 'Octubre: parcial', 'Noviembre: pendiente']);
  expect(screen.getByText('7.5')).toBeInTheDocument();
});

it('publica inmediatamente el importe final al actualizar un saldo', () => {
  const { rerender } = render(<Importe centimos={1250} />);
  expect(screen.getByText(formatearSoles(1250))).toBeVisible();
  rerender(<Importe centimos={0} />);
  expect(screen.getByText(formatearSoles(0))).toBeVisible();
});
