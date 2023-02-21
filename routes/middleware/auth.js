'use strict'
const jwt = require('jsonwebtoken');
const secret = process.env.JWT_SECRET

function auth(req, res, next) {
    try {
        const token = req.headers.authorization.split(' ')[1];
        jwt.verify(token, secret);
        next();
    } catch (err) {
        res.status(401).send('Invalid/missing token')
    }
}

module.exports = auth