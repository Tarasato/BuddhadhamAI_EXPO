# ---------- Stage 1: Build Expo Web ----------
FROM node:22.19.0-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build-time args
ARG EXPO_PUBLIC_API_URL
ARG EXPO_PUBLIC_SOCKET_URL

# Set as env for Expo build
ENV EXPO_PUBLIC_API_URL=$EXPO_PUBLIC_API_URL
ENV EXPO_PUBLIC_SOCKET_URL=$EXPO_PUBLIC_SOCKET_URL

# Build Expo Web
RUN npx expo export --platform web

# ---------- Stage 2: Serve with Nginx ----------
FROM nginx:alpine

# Remove default html
RUN rm -rf /usr/share/nginx/html/*

# Copy built static files
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
