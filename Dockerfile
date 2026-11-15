# Production image for the G10 Vehicle Parking System: the backend API plus the
# CampusPark web front end, served from the same port.
# Build: docker build -t g10-parking .
# Run:   docker run -p 5000:5000 -e MONGO_URI=mongodb://host.docker.internal:27017/g10_vehicle_parking g10-parking

# Stage 1: build the React front end.
FROM node:22-alpine AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend ./
RUN npm run build

# Stage 2: the backend, with the built front end copied in.
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production PORT=5000

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY server.js ./
COPY src ./src
COPY --from=frontend /frontend/dist ./frontend/dist

USER node
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" > /dev/null || exit 1

CMD ["node", "server.js"]
