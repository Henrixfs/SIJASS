import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Importe } from '../Importe';
import { SerieLecturas } from '../paginas/SerieLecturas';
import { formatearSoles } from '../lib/dinero';

const toma = { id: 'a', valor: 0, unidad: 'mg/L', estado: 'vigente', tomadaEn: '2026-11-22T13:00:00Z' };

describe('Presentación de mediciones', () => {
  it('representa las tomas en la misma unidad, incluido el valor cero', () => {
    render(<SerieLecturas lecturas={[{ ...toma, id: 'b', valor: 0.4 }, toma, { ...toma, id: 'c', unidad: 'otra' }]} />);
    expect(screen.getByText('2 tomas · mg/L')).toBeInTheDocument();
  });

  it('omite el gráfico si hay una sola toma comparable, una lectura anulada o un valor inválido', () => {
    render(<SerieLecturas lecturas={[toma, { ...toma, estado: 'anulada' }, { ...toma, valor: NaN }]} />);
    expect(screen.queryByRole('figure')).toBeNull();
  });

  it('conserva vacío el historial sin lecturas', () => {
    const { container } = render(<SerieLecturas lecturas={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

it('publica inmediatamente el importe final al actualizar un saldo', () => {
  const { rerender } = render(<Importe centimos={1250} />);
  expect(screen.getByText(formatearSoles(1250))).toBeVisible();
  rerender(<Importe centimos={0} />);
  expect(screen.getByText(formatearSoles(0))).toBeVisible();
});
