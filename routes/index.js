'use strict';

const express = require('express');

// Internal paths
const lookup = require('./lookup/lookup');

// Middlewware
const auth = require('./middleware/auth');

const router = express.Router();

// Lookup paths are internal only, used by squid for transparent proxy
router.post('/lookupip', lookup.lookupByIp);
router.post('/lookuphost', lookup.lookupHostName);
router.post('/api/addhost', auth, lookup.addHostEntry);
router.get('/api/cleanup', auth, lookup.cleanup);
router.get('/api/installshalla', auth, lookup.installShallaLists);
router.get('/api/installcapitole', auth, lookup.installCapitoleBlacklists);

module.exports = router;
