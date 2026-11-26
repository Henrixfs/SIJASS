/**
 * Jest para las pruebas unitarias y las baterías de contrato sobre memoria (`npm test`).
 * Modo ESM (`--experimental-vm-modules`) con ts-jest sobre el código fuente TypeScript, sin
 * comprobar tipos (eso lo hace `npm run build`). Las pruebas de integración con PostgreSQL y HTTP
 * siguen en `npm run test:integration`.
 *
 * La cobertura mide el núcleo del negocio: dominio, aplicación y los adaptadores de memoria y
 * seguridad. Quedan fuera los archivos que solo declaran tipos (puertos) y los adaptadores de
 * PostgreSQL y HTTP, que se verifican con las pruebas de integración.
 */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: { '^(\.{1,2}/.*)\.js$': '$1' },
  transform: { '^.+\.ts$': ['ts-jest', { useESM: true, tsconfig: 'tsconfig.jest.json' }] },
  roots: ['<rootDir>/src'],
  testMatch: ['<rootDir>/src/pruebas/unitarias/**/*.test.ts'],
  testTimeout: 30000,
  collectCoverageFrom: [
    'src/dominio/**/*.ts',
    'src/aplicacion/**/*.ts',
    'src/infraestructura/**/*.ts',
    '!src/dominio/puertos*.ts',
    '!src/infraestructura/postgres/**',
  ],
  coverageProvider: 'v8',
  coverageDirectory: 'cobertura',
  coverageReporters: ['text', 'text-summary', 'lcov', 'html', 'json-summary'],
  coverageThreshold: { global: { lines: 90, branches: 85, functions: 90, statements: 90 } },
};
