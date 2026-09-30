# Build from the repo root (the npm workspace lockfile lives there):
#   docker build -f api/Dockerfile .
FROM node:20-alpine

WORKDIR /app
COPY package.json package-lock.json ./
COPY api/package.json api/
COPY web/package.json web/
RUN npm ci --omit=dev -w api && npm cache clean --force

COPY api/ api/
# Database and uploads live in one volume mounted here.
RUN mkdir -p api/data/uploads && chown -R node:node api/data

WORKDIR /app/api
ENV NODE_ENV=production PORT=4000 DB_PATH=data/seatko.db UPLOAD_DIR=data/uploads
EXPOSE 4000
USER node
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1
CMD ["node", "src/index.js"]
