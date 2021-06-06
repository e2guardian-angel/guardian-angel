'use strict';

/*
 * This is the initial setup method that doesn't require authentication
 */
const Controller = require('../../lib/controller');
const Config = require('../../lib/config');
const controller = new Controller();

async function setup(req, res) {
    const configData = req.body.config;
    const adminPassword = req.body.adminPassword;
    const tls = req.body.tls;

    // Pull config first to see if we are already configured
    const data = await controller.getKubeData();
    if (data.config && data.config.configured) {
        res.status(503).send('Already configured; log in and reset to reconfigure.');
        return;
    }

    let config;
    try {
        config = new Config(configData);
    } catch (err) {
        res.status(503).send(`Invalid configuration: ${err.message}`);
        return;
    }

    if (!adminPassword) {
        res.status(503).send('Admin password not set');
        return;
    }

    controller.setConfig(config);
    if (tls) {
        try {
            controller.setTLS(tls);
        } catch (err) {
            res.status(503).send('Invalid format for tls secret');
            return;
        }
    } else {
        // Generate a new TLS certificate
        await controller.rotateTLS();
    }

    //TODO: What to do with admin password?

    await controller.initializeSecrets();

    await controller.pushTLS();
    await controller.pushRedisPassword();
    await controller.pushConfig();

    res.status(201).send('OK');
}

module.exports = setup;