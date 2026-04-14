# Use Node.js as the base image for the build stage
FROM node:18 AS build

# Set the working directory
WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm

# Copy the package files and install dependencies
COPY package*.json ./
RUN pnpm install

# Copy the rest of the application code
COPY . .

# Build the application
RUN pnpm build

# Use a minimal Node.js image for production
FROM node:18 AS production

# Set the working directory in the production image
WORKDIR /app

# Copy the build artifacts from the build stage
COPY --from=build /app/dist ./dist

# Expose the port the app runs on
EXPOSE 3000

# Serve the app using a simple server
CMD ["npx", "serve", "-s", "dist", "-l", "3000"]
