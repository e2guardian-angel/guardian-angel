FROM node:current-alpine3.12

RUN mkdir -p /app \
  && mkdir -p /opt/guardian/acl \
  && chown -R node:node /opt/guardian

WORKDIR /app
COPY . .

RUN npm install

EXPOSE 3000

USER node
CMD ["node", "app.js"]
