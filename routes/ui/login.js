'use strict';
const ejs = require('ejs');
const fs = require('fs');
const passport = require('passport');

const loginPage = fs.readFileSync(`${__dirname}/views/login.html`, 'utf-8');

function login(req, res) {
    res.status(200).send(ejs.render(loginPage));
}

async function doLogin(req, res, next) {
    if (!req.body.username || !req.body.password) {
        res.status(401).json({message: 'Please enter a username and password.'});
    } else {
        await passport.authenticate('local', function(err, user, info) {
            if (err) {
                res.status(401).send({message: 'Invalid username or password.'});
            }
            req.session.user = user;
            if(user._doc.forceReset) {
                res.redirect('/passreset');
            } else {
                res.redirect('/dashboard');
            }
        })(req, res, next);
    }
}

module.exports = {get: login, post: doLogin};