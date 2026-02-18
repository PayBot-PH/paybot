# Use an official Node.js runtime as a parent image
FROM node:14

# Set the working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy package.json and package-lock.json
COPY package*.json ./

# Install app dependencies
RUN npm install --omit=dev

# Copy the rest of your application code
COPY . .

# Set environment variables for Railway deployment
ENV PORT=3000
EXPOSE $PORT

# Command to run the application
CMD ["npm", "start"]
