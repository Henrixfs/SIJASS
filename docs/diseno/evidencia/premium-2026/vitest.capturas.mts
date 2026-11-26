import { fileURLToPath } from 'node:url';
import proyecto from '../../../../tecnologia/sijass-web/vite.config.ts';

export default {
  ...proyecto,
  test: {
    ...proyecto.test,
    setupFiles: [fileURLToPath(new URL('./observar-componentes.mjs', import.meta.url))],
  },
};
