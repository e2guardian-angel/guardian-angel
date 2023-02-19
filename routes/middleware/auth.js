'use strict'
const jwt = require('jsonwebtoken');
const secret = process.env.JWT_SECRET

function auth(req, res, next) {
    const token = req.headers.authorization.split(' ')[1];
    try {
        jwt.verify(token, secret);
        next();
    } catch (err) {
        res.status(401).send('Invalid token')
    }
}

module.exports = auth