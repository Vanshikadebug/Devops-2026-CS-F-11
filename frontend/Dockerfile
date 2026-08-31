# ---- ReuseHub web image (multi-stage) --------------------------------
# Stage 1: build the Vite static site.
FROM node:20-alpine AS build

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend ./
RUN npm run build

# Stage 2: serve it with nginx, which also proxies /api to the api service.
FROM nginx:1.27-alpine

COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
