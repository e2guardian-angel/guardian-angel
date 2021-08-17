'use strict'
const express = require('express');
const router = require('../routes');
const lookup = require('../routes/lookup/lookup');
const Config = require('./config');
const fs = require('fs');

const CONFIG_PATH = process.env.CONFIG_PATH || '/opt/guardian/conf/guardian.json'

let app = express();
app.use(express.json());
app.use(router);

let appServer;

function startup() {
    return new Promise(function(resolve, reject) {
        let config;
        try {
            const configFileContents = JSON.parse(fs.readFileSync(CONFIG_PATH));
            config = new Config(configFileContents, {stripUnknown: true});
        } catch (err) {
            console.error(`Failed to start: ${err.message}`);
            return reject(err);
        }

        lookup.init(config).then(() => {
            appServer = app.listen(config.httpPort, function() {
                console.info(`Server is listening on port ${config.httpPort}`);
                return resolve();
            });
        }).catch(err => {
            console.error(`Failed to start: ${err.message}`);
            gracefulShutdown();
            return reject(err);
        });
    })

}

async function gracefulShutdown() {
    console.info('Shutting down...');
    await lookup.finish();
    if (appServer) {
        await appServer.close();
        appServer = null;
    }
    console.info('guardian-angel exited.');
    process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('SIGHUP', gracefulShutdown);

module.exports.startup = startup;
module.exports.gracefulShutdown = gracefulShutdown;
