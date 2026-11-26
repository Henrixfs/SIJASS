# SIJASS: API NestJS + interfaz React en una sola imagen (s1e, design.md D4).
# Construcción desde la raíz del repositorio:  docker build -t sijass .
# Sin secretos: la configuración llega solo por variables de entorno (JWT_SECRET, DATABASE_URL…).

# ---- Etapa 1: compila la API y la interfaz ---------------------------------------------------
FROM node:24-slim AS construir
WORKDIR /src
COPY tecnologia/siJASS-clean-architecture/package.json tecnologia/siJASS-clean-architecture/package-lock.json tecnologia/siJASS-clean-architecture/
RUN npm --prefix tecnologia/siJASS-clean-architecture ci
COPY tecnologia/sijass-web/package.json tecnologia/sijass-web/package-lock.json tecnologia/sijass-web/
RUN npm --prefix tecnologia/sijass-web ci
COPY tecnologia/siJASS-clean-architecture tecnologia/siJASS-clean-architecture
COPY tecnologia/sijass-web tecnologia/sijass-web
RUN npm --prefix tecnologia/siJASS-clean-architecture run build \
 && npm --prefix tecnologia/sijass-web run build

# ---- Etapa «migrar»: aplica las migraciones y termina (no es la imagen de la API) ----------------
FROM construir AS migrar
WORKDIR /src/tecnologia/siJASS-clean-architecture
USER node
CMD ["node", "node_modules/node-pg-migrate/bin/node-pg-migrate.js", "up", "-m", "migraciones"]

# ---- Etapa final: la API con la interfaz, sin dependencias de desarrollo ----------------------
FROM node:24-slim AS api
ENV NODE_ENV=production PORT=3000 WEB_DIR=/app/web
WORKDIR /app
COPY --from=construir /src/tecnologia/siJASS-clean-architecture/package.json /src/tecnologia/siJASS-clean-architecture/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=construir /src/tecnologia/siJASS-clean-architecture/dist ./dist
# Las pruebas compiladas no se necesitan en producción.
RUN rm -rf dist/pruebas
COPY --from=construir /src/tecnologia/siJASS-clean-architecture/corpus-ejemplo ./corpus-ejemplo
COPY --from=construir /src/tecnologia/sijass-web/dist ./web
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/v1/salud').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/api/main.js"]
