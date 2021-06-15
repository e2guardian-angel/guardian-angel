'use strict';
const ejs = require('ejs');
const fs = require('fs');

function cert(req, res) {
    res.status(200).send(ejs.render(fs.readFileSync(`${__dirname}/views/dashboard.html`, 'utf-8')));
}

module.exports = cert;