# Use lightweight Node image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build TypeScript (optional, or just run ts-node directly for simplicity)
# For this bounty, running via ts-node is acceptable for the prototype
CMD ["npx", "ts-node", "dashboard.ts"]

# Expose the dashboard port
EXPOSE 3000