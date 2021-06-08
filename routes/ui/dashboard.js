'use strict';

function cert(req, res) {
    res.status(401).send('Dashboard goes here');
}

module.exports = cert;