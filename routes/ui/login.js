'use strict';
const ejs = require('ejs');
const fs = require('fs');

const loginPage = fs.readFileSync(`${__dirname}/views/login.html`, 'utf-8');

function login(req, res) {
    res.status(200).send(ejs.render(loginPage));
}

function doLogin(req, res) {
    let username = req.body.username;
    // TODO: authenticate
    res.redirect('/');
}

module.exports = {get: login, post: doLogin};