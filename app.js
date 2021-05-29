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

controller.getKubeData().then(async kubeData => {
    await lookup.init(kubeData);
    app.listen(kubeData.config.httpPort, function(err) {
        if (err) {
            console.error(err);
        }
        console.info(`Server is listening on port ${kubeData.config.httpPort}`);
    });
}).catch(err => {
    console.error(`Failed to start: ${err.message}`);
});

function gracefulShutdown() {
    console.info('Shutting down...');
    app.close(() => {
        console.info('guardian-angel exited.');
    });
    lookup.finish(() => {
        console.info('Closed db and redis connections.');
    });
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('SIGHUP', gracefulShutdown);
