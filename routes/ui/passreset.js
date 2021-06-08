'use strict';

function cert(req, res) {
    res.status(200).send('This is where you are directed when you need to reset a password');
}

module.exports = cert;