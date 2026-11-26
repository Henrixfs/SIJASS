/**
 * Marco de pruebas común (`describe`, `test`, `before`, `after`).
 *
 * Las baterías de contrato de `contrato/` se ejecutan sobre dos implementaciones y con dos
 * ejecutores: Jest (`npm test`, memoria, con reporte de cobertura) y el ejecutor nativo de Node.js
 * (`npm run test:integration`, PostgreSQL, un proceso por archivo). Todas las pruebas importan
 * este módulo en lugar de un ejecutor concreto, de modo que el mismo código corre en ambos.
 * Solo se usan funciones con la misma forma en los dos: nombre y cuerpo, sin opciones.
 */
type Cuerpo = () => void | Promise<void>;

interface Marco {
  describe(nombre: string, cuerpo: () => void): void;
  test(nombre: string, cuerpo: Cuerpo): void;
  before(cuerpo: Cuerpo): void;
  after(cuerpo: Cuerpo): void;
}

async function conJest(): Promise<Marco> {
  const j = await import('@jest/globals');
  return {
    describe: (nombre, cuerpo) => j.describe(nombre, cuerpo),
    test: (nombre, cuerpo) => j.test(nombre, cuerpo),
    before: (cuerpo) => j.beforeAll(cuerpo),
    after: (cuerpo) => j.afterAll(cuerpo),
  };
}

async function conNode(): Promise<Marco> {
  const n = await import('node:test');
  return {
    describe: (nombre, cuerpo) => void n.describe(nombre, cuerpo),
    test: (nombre, cuerpo) => void n.test(nombre, cuerpo),
    before: (cuerpo) => n.before(cuerpo),
    after: (cuerpo) => n.after(cuerpo),
  };
}

const marco: Marco = process.env.JEST_WORKER_ID !== undefined ? await conJest() : await conNode();

export const { describe, test, before, after } = marco;
