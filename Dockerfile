FROM node:current-alpine3.12

RUN mkdir -p /app
WORKDIR /app
COPY . .

RUN npm install

EXPOSE 3000

CMD ["node", "app.js"]
