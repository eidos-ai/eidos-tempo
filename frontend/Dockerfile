FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
# compose (docker-compose.yml) or cloudrun (Cloud Run)
ARG NGINX_SITE=compose
RUN sed -i 's/^worker_processes .*/worker_processes 1;/' /etc/nginx/nginx.conf
COPY nginx/app.conf /etc/nginx/tempo/app.conf
COPY nginx/${NGINX_SITE}.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
