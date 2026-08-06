FROM --platform=$BUILDPLATFORM node:24-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci || npm install

# Copy source code
COPY . .

# Clarity is configured at Vite build time and is intentionally public client configuration.
ARG VITE_ENABLE_CLARITY=false
ARG VITE_CLARITY_PROJECT_ID
ENV VITE_ENABLE_CLARITY=${VITE_ENABLE_CLARITY}
ENV VITE_CLARITY_PROJECT_ID=${VITE_CLARITY_PROJECT_ID}

# Build the application
RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:alpine

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
