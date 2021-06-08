'use strict';

/*
 * This is the initial setup method that doesn't require authentication
 */
const Controller = require('../../lib/controller');
const Config = require('../../lib/config');
const controller = new Controller();

async function setup(req, res) {
    const tls = req.body.tls;

    // Pull config first to see if we are already configured
    const data = await controller.getKubeData();
    if (data.config && data.config.httpsEnabled && data.config.tls) {
        res.status(503).send('TLS already configured; log in and reset to reconfigure.');
        return;
    }

    // Turn on https
    let config = data.config;
    if (!config) {
        config = new Config({});
    }
    config.httpsEnabled = true;

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

    await controller.pushTLS();
    await controller.pushConfig();

    res.status(201).send('OK');
}

module.exports = setup;