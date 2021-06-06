'use strict';

const express = require('express');
const lookup = require('./lookup/lookup');
const setup = require('./setup/setup');
const cert = require('./cert/cert');

const router = express.Router();

router.post('/lookupip', lookup.lookupByIp);
router.post('/lookuphost', lookup.lookupHostName);

// Unauthenticated setup path
router.post('/setup', setup);
router.get('/cert', cert);

// Authenticated paths
const configure = require('./api/configure');
const deploy = require('./api/deploy');
const authRouter = express.Router();
authRouter.post('/configure', configure);
authRouter.get('/deploy', deploy);

router.use('/api', authRouter);

module.exports = router;