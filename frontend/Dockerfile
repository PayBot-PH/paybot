# Use Node 18 base image
FROM node:18-alpine

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy all frontend files
COPY . .

# Build the React app
RUN pnpm run build

# Expose port (Railway will use $PORT environment variable)
EXPOSE ${PORT:-3000}

# Start the preview server
CMD pnpm run preview --host 0.0.0.0 --port ${PORT:-3000}
