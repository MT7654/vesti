FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV HOST=0.0.0.0
ENV PORT=3001
EXPOSE 3001
CMD ["npm", "run", "start:api"]
