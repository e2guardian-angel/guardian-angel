'use strict';
const Controller = require('../../lib/controller');
const controller = new Controller();

function deploy(req, res) {
    const config = controller.getConfig();
    res.status(200).json(config);
}

module.exports = deploy;