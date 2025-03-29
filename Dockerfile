# Build stage
FROM node:22.12-alpine AS builder

WORKDIR /app

# Install pnpm using npm instead of corepack
RUN npm install -g pnpm

# Copy package files and TypeScript config
COPY package*.json ./
COPY pnpm-lock.yaml* ./ 
COPY tsconfig.json ./
COPY src/ ./src/

# Install all dependencies (including devDependencies)
RUN --mount=type=cache,target=/root/.pnpm-store \
    if [ -f pnpm-lock.yaml ]; then \
      pnpm install --frozen-lockfile; \
    else \
      pnpm install; \
    fi

# Build TypeScript files
RUN pnpm build

# Production stage
FROM node:22-alpine AS release

# Install socat
RUN apk add --no-cache socat

WORKDIR /app

# Copy built files and package files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/pnpm-lock.yaml* ./

# Set production environment
ENV NODE_ENV=production
ENV IDE_PORT=8090

# Install pnpm and only production dependencies
RUN npm install -g pnpm && \
    if [ -f pnpm-lock.yaml ]; then \
      pnpm install --prod --frozen-lockfile --ignore-scripts; \
    else \
      pnpm install --prod --ignore-scripts; \
    fi

# Create startup script that uses socat
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo 'socat TCP-LISTEN:${IDE_PORT},fork,reuseaddr TCP:host.docker.internal:${IDE_PORT} &' >> /app/start.sh && \
    echo 'export HOST=localhost' >> /app/start.sh && \
    echo 'node /app/dist/src/index.js' >> /app/start.sh && \
    chmod +x /app/start.sh

# Run the startup script
ENTRYPOINT ["/app/start.sh"]