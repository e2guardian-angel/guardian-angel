'use strict'
const express = require('express');
const bodyParser = require('body-parser')
const helmet = require('helmet');
const routers = require('../routes');
const lookup = require('../routes/lookup/lookup');
const Controller = require('../lib/controller');

let app = express();
app.use(bodyParser.json());
app.use(routers.unauth);
app.use(routers.auth);
app.use(helmet());

const controller = new Controller();
let appServer;

function startup() {
    return new Promise(function(resolve) {
        controller.getKubeData().then(async kubeData => {
            await lookup.init(kubeData);
            if (!kubeData.nginx) {
                // Ingress is not started; start it as we will need it to configure guardian-angel
                await controller.deployNginx();
            }
            appServer = app.listen(kubeData.config.httpPort, function() {
                console.info(`Server is listening on port ${kubeData.config.httpPort}`);
                resolve();
            });
        }).catch(err => {
            console.error(`Failed to start: ${err.message}`);
            resolve();
        });
    });
}

function gracefulShutdown() {
    console.info('Shutting down...');
    if (appServer) {
        appServer.close(async () => {
            await lookup.finish();
            console.info('guardian-angel exited.');
            appServer = null;
            process.exit(0);
        });
    }
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('SIGHUP', gracefulShutdown);

module.exports.startup = startup;
module.exports.gracefulShutdown = gracefulShutdown;
