FROM node:18.19-alpine


RUN mkdir -p /app \
  && mkdir -p /opt/guardian/acl \
  && chown -R node:node /opt/guardian

WORKDIR /app
COPY . .

RUN npm install

EXPOSE 3000

arg VERSION
env NODEVERSION ${VERSION}

USER node
CMD ["node", "app.js"]
