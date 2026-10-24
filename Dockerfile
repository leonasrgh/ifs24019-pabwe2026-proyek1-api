FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
ENV PORT=8000 DB_PATH=/data/nebengkampus.db
VOLUME /data
EXPOSE 8000
CMD ["node", "src/server.js"]
