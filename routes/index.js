'use strict';

const express = require('express');

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

const unauthRouter = express.Router();

// Lookup paths are internal only, used by squid for transparent proxy
unauthRouter.post('/lookupip', lookup.lookupByIp);
unauthRouter.post('/lookuphost', lookup.lookupHostName);

// Unauthenticated paths
unauthRouter.post('/api/setup', setup);
unauthRouter.get('/ui/cert', cert);
unauthRouter.get('/ui/login', login);

// Authenticated paths
const authRouter = express.Router();
authRouter.post('/api/configure', configure);
authRouter.get('/api/deploy', deploy);
authRouter.get('/ui/passreset', passReset);
authRouter.get('/ui/dashboard', dashboard);

module.exports = {unauth: unauthRouter, auth: authRouter};