# SIJASS — Sistema de Monitoreo Inteligente para JASS

**Análisis y diseño arquitectónico** · Curso **IS-488 Arquitectura de Software**
Universidad Nacional de San Cristóbal de Huamanga — Escuela Profesional de Ingeniería de Sistemas

**Autor:** Flores Saras, Henry Josue (27220123)

**Docente:** Ing. Lizbeth Jaico Quispe

Ayacucho, Perú — 2026

---

## Descripción

SIJASS es una solución de software orientada a las **Juntas Administradoras de Servicios de Saneamiento (JASS)** de la región Ayacucho, organizaciones comunales encargadas del agua potable en el ámbito rural.

El sistema atiende dos necesidades concretas:

1. **Verificar de forma objetiva el nivel de cloro residual del agua**, que hoy se estima comparando a simple vista el color de un reactivo DPD contra una escala impresa.
2. **Digitalizar el control de las cuotas familiares**, que se lleva en cuadernos físicos.

La solución incorpora un módulo de **inteligencia artificial analítica** basado en visión artificial, capaz de funcionar en el propio teléfono del operador **aun sin conexión a internet**.

---

## Estructura del repositorio

```
.
├── README.md
├── analisis-de-sistema/
│   ├── 01-actores.md                    # Actores e interesados
│   ├── 02-historias-de-usuario.md       # Historias de usuario (HU01–HU11)
│   ├── 03-requisitos-funcionales.md     # Requisitos funcionales (RF01–RF12)
│   ├── 04-atributos-de-calidad.md       # Atributos de calidad (RNF01–RNF08)
│   ├── 05-restricciones.md              # Restricciones (RC01–RC12)
│   └── 06-drivers-arquitectonicos.md    # Drivers arquitectónicos (DA01–DA10)
└── arquitectura/
    ├── arquitectura-inicial.md          # Diseño arquitectónico en capas
    └── arquitectura-inicial.xml         # Diagrama editable en draw.io
```

---

## Etapas del análisis

| Etapa | Documento | Contenido |
|---|---|---|
| **1** | `01-actores.md` | 7 actores: 3 primarios, 2 interesados, 2 sistemas externos |
| **2** | `02-historias-de-usuario.md` | 11 historias de usuario priorizadas con MoSCoW |
| **3** | `03-requisitos-funcionales.md` | 12 requisitos funcionales y 9 casos de uso |
| **4** | `04-atributos-de-calidad.md` | 8 atributos de calidad con escenarios medibles |
| **5** | `05-restricciones.md` | 12 restricciones y 5 registros de decisión (ADR) |
| **6** | `06-drivers-arquitectonicos.md` | 10 drivers que condicionan la arquitectura |
| **7** | `arquitectura-inicial.md` | Vistas C4, vista lógica en capas y modelo de datos |

---

## Arquitectura en una línea

> **Monolito modular** (Node.js / NestJS) + **servicio de IA independiente** (Python / ONNX) + **cliente PWA con capacidad sin conexión** (React / IndexedDB / ONNX Runtime Web).

### Drivers dominantes

| Driver | Consecuencia arquitectónica |
|---|---|
| **DA01** — Operación sin conexión | PWA con IndexedDB, cola local y sincronización idempotente por UUID |
| **DA02** — Inferencia en el borde | Modelo `.onnx` ejecutado en el teléfono; el servidor solo verifica después |
| **DA05** — Equipo de una persona | Monolito modular en lugar de microservicios |

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Cliente | React, Vite, Workbox, Dexie (IndexedDB), ONNX Runtime Web |
| Backend | Node.js, NestJS, API REST con JWT |
| IA | Python, FastAPI, PyTorch, MobileNetV3-Small, ONNX |
| Datos | PostgreSQL, Redis, almacén de objetos |

---

## Cómo ver los diagramas

- Los diagramas **Mermaid** dentro de los `.md` se renderizan automáticamente en GitHub.
- El diagrama **draw.io** (`arquitectura/arquitectura-inicial.xml`) se abre en [app.diagrams.net](https://app.diagrams.net) con **File → Open From → Device**.

---

## Referencias

- Bass, L., Clements, P., & Kazman, R. (2021). *Software Architecture in Practice* (4th ed.). Addison-Wesley.
- Brown, S. (2018). *The C4 model for visualising software architecture*. https://c4model.com
- Martin, R. C. (2017). *Clean Architecture*. Prentice Hall.
- Nygard, M. (2011). *Documenting architecture decisions*.
- Dirección General de Salud Ambiental. (2011). *Reglamento de la calidad del agua para consumo humano: D.S. N.° 031-2010-SA*.
