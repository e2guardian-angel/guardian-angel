'use strict'
const express = require('express');
const bodyParser = require('body-parser')
const router = require('./routes');
const lookup = require('./routes/lookup/lookup');
const Controller = require('./lib/controller');

const controller = new Controller();

let app = express();
app.use(bodyParser.json());
app.use(router);

controller.getConfig().then(async config => {
    await lookup.init(config);
    app.listen(config.httpPort, function(err) {
        if (err) {
            console.error(err);
        }
        console.info(`Server is listening on port ${config.httpPort}`);
    });
});
