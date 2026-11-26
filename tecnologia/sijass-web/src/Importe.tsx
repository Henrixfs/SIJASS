import { useEffect, useRef } from 'react';
import { useAnimate } from 'motion/react-mini';
import { formatearSoles } from './lib/dinero';

export function Importe({ centimos }: { centimos: number }) {
  const [elemento, animar] = useAnimate<HTMLSpanElement>();

  const anterior = useRef(centimos);
  useEffect(() => {
    const cambio = anterior.current !== centimos;
    anterior.current = centimos;
    const reducir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (cambio && !reducir && typeof elemento.current?.animate === 'function') {
      const control = animar(elemento.current, { opacity: [0.55, 1], transform: ['translateY(3px)', 'translateY(0)'] }, { duration: 0.18 });
      return () => control.stop();
    }
  }, [animar, centimos, elemento]);
  return <span className="importe" ref={elemento}>{formatearSoles(centimos)}</span>;
}
