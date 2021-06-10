'use strict';

const express = require('express');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;

// API paths
const configure = require('./api/configure');
const deploy = require('./api/deploy');
// UI paths
const dashboard = require('./ui/dashboard');
const passReset = require('./ui/passreset');
const setup = require('./api/setup');
const cert = require('./ui/cert');
const login = require('./ui/login');
// Internal paths
const lookup = require('./lookup/lookup');
// Auth

function isLoggedIn(req, res, next) {
    if (req.session.user) {
        return next();
    }
    res.redirect('/login');
}

const router = express.Router();

// Lookup paths are internal only, used by squid for transparent proxy
router.post('/lookupip', lookup.lookupByIp);
router.post('/lookuphost', lookup.lookupHostName);

// Unauthenticated paths
router.post('/api/setup', setup);
router.get('/ui/cert', cert);
router.get('/ui/login', login.get);
router.post('/ui/login', login.post);
router.use('/static', express.static('static'));

// Authenticated paths
router.post('/api/configure', isLoggedIn, configure);
router.get('/api/deploy', isLoggedIn, deploy);
router.get('/ui/passreset', isLoggedIn, passReset);
router.get('/ui/dashboard', isLoggedIn, dashboard);

module.exports = router;
