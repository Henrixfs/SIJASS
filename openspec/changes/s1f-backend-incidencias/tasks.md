# Tasks

## 1. Contrato y dominio

- [ ] 1.1 Revisar y aprobar matriz de roles, estados, reapertura, reglas, límites de fotos y contrato REST; registrar decisiones antes de implementar.
- [ ] 1.2 Definir contrato REST en OpenAPI y pruebas de coherencia de rutas, entradas y errores; comprobar que la prueba detecta una ruta no documentada.
- [ ] 1.3 Implementar dominio de registro, cierre y reapertura; probar campos inválidos, transiciones prohibidas, motivos y conservación de ciclos.
- [ ] 1.4 Implementar matriz por categoría, alcance y versión, sugerencia y confirmación humana; probar las 24 combinaciones, cada alcance, cambios aislados por JASS, configuración incompleta y preservación de sugerencias anteriores.

## 2. Persistencia y seguridad

- [ ] 2.1 Crear migración aditiva y repositorios con aislamiento por JASS e historial de solo inserción; comprobar restricciones y reversión transaccional en PostgreSQL desechable.
- [ ] 2.2 Implementar reserva idempotente con hash que incluye alcance y probar respuesta perdida, reintentos tras cambios de reglas, conflicto por alcance distinto, actor distinto, rollback y diez solicitudes concurrentes.
- [ ] 2.3 Aplicar matriz de permisos por recurso y probar 401, 403, usuario ajeno, otra JASS y responsable inactivo por HTTP.
- [ ] 2.4 Añadir acciones, asignación, revisión optimista y auditoría transaccional; probar cambios simultáneos, desactivación del responsable, historial público/privado y rollback si falla la auditoría.

## 3. Evidencias fotográficas

- [ ] 3.1 Incorporar carga idempotente y lectura protegida de una fotografía; probar formatos y firmas, EXIF, tamaño, acceso ajeno, reintentos y no-store.
- [ ] 3.2 Documentar límites, retención propuesta y recuperación de evidencia; probar que una falla de escritura no deja un archivo accesible ni metadatos inconsistentes.

## 4. Integración y trazabilidad

- [ ] 4.1 Ejecutar lint, compilación, unitarias y batería de integración backend sobre PostgreSQL desechable; registrar comandos y resultados.
- [ ] 4.2 Actualizar OpenAPI, matriz de trazabilidad y evidencias de los criterios afectados; ejecutar verificador documental y validación estricta OpenSpec.
- [ ] 4.3 Revisar migración y plan de respaldo/restauración; verificar restauración en un entorno desechable sin afectar datos existentes.

## 5. Cierre Sprint 0 (preparación sin modificar artefactos anteriores)

- [ ] 5.1 Tras autorización separada actualizar trazabilidad y evidencias del Sprint 0: compilación desde fuente, 400 unitarias, integración código 0 sin recuento, OpenSpec y respaldo/restauración comparados; enlazar comandos y límites del entorno.
- [ ] 5.2 Tras autorización, evaluar marcar `s1c` tarea 7.1 según ejecución estricta observada; volver a validar y no archivar sin aprobación.
- [ ] 5.3 Antes de integrar PR #8–#12, confirmar sus bases, diffs, protecciones y CI; tras autorización integrar secuencialmente y revalidar cada cambio de base sin asumir que el estado anterior sigue vigente.

## Workflow follow-up

- Archivar únicamente tras implementación completa, validación y autorización expresa.

## Evidencia de planificación

- `openspec validate s1f-backend-incidencias --strict`: válido, código 0 tras incorporar alcance reportado y matriz de prioridad. Esta validación no verifica implementación.
