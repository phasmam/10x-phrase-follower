# Multi-stage build for production
FROM node:22.14.0-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build arguments for environment variables (PUBLIC_* variables need to be available at build time)
ARG PUBLIC_SUPABASE_URL
ARG PUBLIC_SUPABASE_KEY
ARG SUPABASE_URL
ARG SUPABASE_KEY
ARG NODE_ENV=production

# Set environment variables for build
ENV PUBLIC_SUPABASE_URL=${PUBLIC_SUPABASE_URL}
ENV PUBLIC_SUPABASE_KEY=${PUBLIC_SUPABASE_KEY}
ENV SUPABASE_URL=${SUPABASE_URL}
ENV SUPABASE_KEY=${SUPABASE_KEY}
ENV NODE_ENV=${NODE_ENV}

# Build the application (Astro with Node adapter)
# Ensure CF_PAGES is not set so Node adapter is used
RUN npm run build

# Production stage
FROM node:22.14.0-alpine AS runner

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built application from builder (includes assets copied by build script)
COPY --from=builder /app/dist ./dist

# Expose port 3000
EXPOSE 3000

# Set environment to production
ENV NODE_ENV=production

# Start the application
CMD ["node", "dist/server/entry.mjs"]

