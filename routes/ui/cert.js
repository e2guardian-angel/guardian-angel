'use strict';

function cert(req, res) {
    res.status(200).send('This is where you download the certificate');
}

module.exports = cert;