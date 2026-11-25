FROM node:22-alpine AS build
WORKDIR /app
COPY services/calls/package*.json ./
RUN npm install
COPY services/calls/tsconfig.json ./tsconfig.json
COPY services/calls/src ./src
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production PORT=4100
WORKDIR /app
COPY services/calls/package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 4100
USER node
CMD ["node", "dist/server.js"]
