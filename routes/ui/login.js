'use strict';
const ejs = require('ejs');
const fs = require('fs');
const passport = require('passport');

const loginPage = fs.readFileSync(`${__dirname}/views/login.html`, 'utf-8');

function login(req, res) {
    if (req.query.error) {
        // TODO: show message for login error
    }
    res.status(200).send(ejs.render(loginPage));
}

async function doLogin(req, res, next) {
    if (!req.body.username || !req.body.password) {
        res.status(401).json({message: 'Please enter a username and password.'});
    } else {
        await passport.authenticate('local', function(err, user, info) {
            if (err || !user) {
                // TODO: This should be moved to an nginx location. Here we should just be returning 401.
                return res.status(401).redirect('/login?error=true');
            } else {
                req.login(user, function(err) {
                    if(user._doc.forceReset) {
                        res.redirect('/passreset');
                    } else {
                        res.redirect('/dashboard');
                    }
                });
            }
        })(req, res, next);
    }
}

module.exports = {get: login, post: doLogin};