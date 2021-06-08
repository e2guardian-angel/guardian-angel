'use strict';

function cert(req, res) {
    res.status(200).send('This is the login page');
}

module.exports = cert;