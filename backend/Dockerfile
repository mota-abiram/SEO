# Use Node.js LTS
FROM node:18-slim

# Install build dependencies for native modules (like bcrypt)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /usr/src/app

# Install dependencies first (for better caching)
COPY package*.json ./
RUN npm install --production

# Copy app source
COPY . .

# Expose the port the app runs on
EXPOSE 5000

# Start the server
CMD [ "npm", "start" ]
