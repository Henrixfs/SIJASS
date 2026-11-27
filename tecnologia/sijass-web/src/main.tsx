import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ClienteApi } from './api/cliente';
import './estilos.css';
import './premium.css';
import './altiplano.css';
import './v3/maqueta.css';
import './v3/sistema.css';

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <App api={new ClienteApi()} />
  </StrictMode>,
);
