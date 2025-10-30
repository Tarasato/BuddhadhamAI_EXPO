# Stage 1: Build Expo Web
FROM node:20 AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build:web

# Stage 2: Serve with Nginx
FROM nginx:alpine
COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY nginx/conf/default.conf /etc/nginx/conf/default.conf
COPY nginx/cert.pem /etc/nginx/cert.pem
COPY nginx/key.pem /etc/nginx/key.pem
COPY dist/ /usr/share/nginx/html

EXPOSE 80 443
CMD ["nginx", "-g", "daemon off;"]
