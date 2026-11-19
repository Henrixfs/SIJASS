import { useState, type FormEvent } from 'react';
import { ErrorApi } from '../api/cliente';
import { mensajeDeError, useApp } from '../contexto';
import { inicioDe } from '../lib/rutas';

export function Ingreso() {
  const { api, navegar } = useApp();
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const s = await api.iniciarSesion(correo.trim(), contrasena);
      navegar(inicioDe(s.perfil));
    } catch (err) {
      if (err instanceof ErrorApi && err.estado === 429) setError('Demasiados intentos fallidos. Espere unos minutos e intente de nuevo.');
      else if (err instanceof ErrorApi && err.estado === 401) setError('Correo o contraseña incorrectos.');
      else setError(mensajeDeError(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="ingreso">
      <form className="tarjeta" onSubmit={enviar} aria-labelledby="titulo-ingreso">
        <h1 id="titulo-ingreso">Ingresar a SIJASS</h1>
        <p className="suave">Cuotas y pagos de su Junta Administradora de Servicios de Saneamiento.</p>
        <label>
          Correo electrónico
          <input name="correo" type="email" autoComplete="username" required value={correo} onChange={(e) => setCorreo(e.target.value)} />
        </label>
        <label>
          Contraseña
          <input name="contrasena" type="password" autoComplete="current-password" required value={contrasena} onChange={(e) => setContrasena(e.target.value)} />
        </label>
        {error && (
          <p role="alert" className="error" data-testid="error-ingreso">
            {error}
          </p>
        )}
        <button type="submit" className="primario" disabled={enviando}>
          {enviando ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </main>
  );
}
