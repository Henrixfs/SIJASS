import { useEffect, useRef } from 'react';
import type { Foto } from '../lib/fotos';

/**
 * Agua viva sobre la foto real de la laguna (WebGL). Solo deforma los píxeles turquesa bajo el
 * horizonte: montañas, cielo y pasto quedan intactos. Sin WebGL, sin la foto o con «reducir
 * movimiento» queda la foto quieta (el `div` de fondo). El bucle se pausa con la pestaña oculta.
 */
const VS = 'attribute vec2 p;varying vec2 v;void main(){v=vec2((p.x+1.0)*0.5,(1.0-p.y)*0.5);gl_Position=vec4(p,0.0,1.0);}';
const FS = `precision highp float;
uniform sampler2D tex; uniform float t; uniform vec4 cubrir; uniform vec4 rip[10]; varying vec2 v;
float agua(vec2 uv, vec3 c){ return smoothstep(0.530,0.547,uv.y)*smoothstep(0.07,0.17,c.b-c.r); }
void main(){
  float zoom = 1.035 + 0.025*sin(t*0.10);
  vec2 foco = vec2(0.55,0.56);
  vec2 s = (v-foco)/zoom + foco;
  vec2 uv = s*cubrir.xy + cubrir.zw;
  vec3 base = texture2D(tex, uv).rgb;
  float m = agua(uv, base);
  float prof = clamp((uv.y-0.53)/0.47, 0.0, 1.0);
  float amp = mix(0.22, 1.0, prof);
  vec2 d = vec2(sin(uv.y*150.0/(0.30+prof) + t*1.9)*0.0019 + sin(uv.y*88.0 - t*1.2 + uv.x*21.0)*0.0015, sin(uv.x*64.0 + t*1.45 + uv.y*46.0)*0.0014) * amp;
  float luz = 0.0;
  for(int i=0;i<10;i++){
    vec4 r = rip[i];
    float edad = t - r.z;
    if(r.w > 0.0 && edad >= 0.0 && edad < 3.4){
      vec2 q = (v - r.xy) * vec2(1.6, 3.1);
      float dist = length(q);
      float x = dist - edad*0.36;
      float onda = sin(x*92.0) * exp(-x*x*190.0) * exp(-edad*1.15) * r.w;
      d += (q/(dist+0.0001)) * onda * vec2(0.011, 0.008) * amp;
      luz += onda;
    }
  }
  vec2 uv2 = uv + d*m;
  vec3 c = texture2D(tex, uv2).rgb;
  c = mix(base, c, m*agua(uv2, c));
  float g = sin(uv.x*520.0 + t*2.3 + sin(uv.y*140.0)*3.0) * sin(uv.y*300.0/(0.35+prof) - t*1.7);
  float brillo = pow(max(g,0.0), 16.0) * smoothstep(0.42, 0.0, abs(uv.x-0.55));
  c += (brillo*0.26 + luz*0.20) * m;
  gl_FragColor = vec4(c, 1.0);
}`;

function crearPrograma(gl: WebGLRenderingContext): WebGLProgram | null {
  const sombreador = (tipo: number, fuente: string) => {
    const s = gl.createShader(tipo);
    if (!s) return null;
    gl.shaderSource(s, fuente);
    gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  };
  const vs = sombreador(gl.VERTEX_SHADER, VS);
  const fs = sombreador(gl.FRAGMENT_SHADER, FS);
  const prog = gl.createProgram();
  if (!vs || !fs || !prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  return gl.getProgramParameter(prog, gl.LINK_STATUS) ? prog : null;
}

export function LagunaViva({ foto, className = '' }: { foto: Foto; className?: string }) {
  const lienzo = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = lienzo.current;
    const reducir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (!canvas || reducir) return;
    const gl = (() => {
      try {
        return canvas.getContext('webgl', { antialias: false });
      } catch {
        return null;
      }
    })();
    if (!gl) return;
    const programa = crearPrograma(gl);
    if (!programa) return;
    const g = gl;
    g.useProgram(programa);
    g.bindBuffer(g.ARRAY_BUFFER, g.createBuffer());
    g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), g.STATIC_DRAW);
    const p = g.getAttribLocation(programa, 'p');
    g.enableVertexAttribArray(p);
    g.vertexAttribPointer(p, 2, g.FLOAT, false, 0, 0);
    const uT = g.getUniformLocation(programa, 't');
    const uCubrir = g.getUniformLocation(programa, 'cubrir');
    const uRip = g.getUniformLocation(programa, 'rip[0]');
    const rips = new Float32Array(40);
    let n = 0;
    let cuadro = 0;
    let lista = false;
    let vivo = true;
    const origen = performance.now();
    const ahora = () => (performance.now() - origen) / 1000;

    const ajustar = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const { width, height } = canvas.getBoundingClientRect();
      if (width === 0 || height === 0) return;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      g.viewport(0, 0, canvas.width, canvas.height);
      if (lista && imagen.width) {
        const k = Math.max(width / imagen.width, height / imagen.height);
        const w = imagen.width * k;
        const h = imagen.height * k;
        g.uniform4f(uCubrir, width / w, height / h, (w - width) / 2 / w, (h - height) / 2 / h);
      }
    };
    const pintar = () => {
      g.uniform1f(uT, ahora());
      g.uniform4fv(uRip, rips);
      g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
    };
    const bucle = () => {
      cancelAnimationFrame(cuadro);
      if (!vivo || !lista || document.hidden) return;
      pintar();
      cuadro = requestAnimationFrame(bucle);
    };

    const imagen = new Image();
    imagen.onload = () => {
      if (!vivo) return;
      const tex = g.createTexture();
      g.bindTexture(g.TEXTURE_2D, tex);
      g.texImage2D(g.TEXTURE_2D, 0, g.RGB, g.RGB, g.UNSIGNED_BYTE, imagen);
      for (const [k, val] of [[g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE], [g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE], [g.TEXTURE_MIN_FILTER, g.LINEAR], [g.TEXTURE_MAG_FILTER, g.LINEAR]] as const) g.texParameteri(g.TEXTURE_2D, k, val);
      lista = true;
      ajustar();
      canvas.dataset.lista = 'si';
      bucle();
    };
    imagen.src = foto.url;

    const onda = (e: PointerEvent, fuerza: number) => {
      const r = canvas.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      if (y < 0.55 || x < 0 || x > 1) return;
      const i = (n++ % 10) * 4;
      rips[i] = x; rips[i + 1] = y; rips[i + 2] = ahora(); rips[i + 3] = fuerza;
    };
    let ultima = 0;
    const alMover = (e: PointerEvent) => {
      if (performance.now() - ultima < 160 || (e.target as Element | null)?.closest?.('form')) return;
      ultima = performance.now();
      onda(e, 0.42);
    };
    const alPulsar = (e: PointerEvent) => { if (!(e.target as Element | null)?.closest?.('form')) onda(e, 1.5); };
    const zona = canvas.parentElement;
    zona?.addEventListener('pointermove', alMover);
    zona?.addEventListener('pointerdown', alPulsar);
    const alVer = () => bucle();
    document.addEventListener('visibilitychange', alVer);
    const observador = typeof ResizeObserver === 'function' ? new ResizeObserver(ajustar) : null;
    observador?.observe(canvas);
    // Una gota cae de vez en cuando sobre la laguna.
    const gotas = window.setInterval(() => {
      if (document.hidden) return;
      const i = (n++ % 10) * 4;
      rips[i] = 0.34 + Math.random() * 0.24; rips[i + 1] = 0.66 + Math.random() * 0.18; rips[i + 2] = ahora(); rips[i + 3] = 1.1;
    }, 3200);

    return () => {
      vivo = false;
      cancelAnimationFrame(cuadro);
      window.clearInterval(gotas);
      zona?.removeEventListener('pointermove', alMover);
      zona?.removeEventListener('pointerdown', alPulsar);
      document.removeEventListener('visibilitychange', alVer);
      observador?.disconnect();
      g.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [foto.url]);

  return (
    <div className={`laguna ${className}`}>
      <div className="laguna-foto" role="img" aria-label={foto.descripcion} style={{ backgroundImage: `url('${foto.url}')` }} />
      <canvas ref={lienzo} className="laguna-lienzo" aria-hidden="true" />
    </div>
  );
}
