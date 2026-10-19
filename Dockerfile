FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/signals/package.json packages/signals/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY . .
RUN npm run build -w web
ENV NODE_ENV=production PORT=8787
EXPOSE 8787
# Serves the API and the built web app; applies the schema + seed data on start.
CMD ["npm", "start", "-w", "server"]
