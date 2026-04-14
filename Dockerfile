# Dockerfile

# Use an official Node.js runtime as a parent image
FROM node:14

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install the app dependencies
RUN npm install

# Copy the application code
COPY . .

# Build the app
RUN npm run build

# Make the app available on a specific port
EXPOSE 8080

# Define the command to run the app
CMD [ "npm", "start" ]
