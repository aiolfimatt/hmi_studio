# syntax=docker/dockerfile:1
#
# OPC UA test server image (test bench). Build context: ./test-bench
FROM node:20-slim
WORKDIR /srv
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY . ./
EXPOSE 4840
CMD ["node", "opcua-server.js"]
