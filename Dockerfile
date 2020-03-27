FROM node:lts-alpine
# Create app directory
WORKDIR /usr/src/app
# Install app dependencies
COPY package*.json ./
RUN npm install
# RUN npm ci --only=production
# Bundle app source
COPY . .
RUN npm run-script build
EXPOSE 3000
CMD [ "npm", "run-script", "server" ]