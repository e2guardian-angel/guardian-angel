'use strict';

const express = require('express');

// Internal paths
const lookup = require('./lookup/lookup');

const router = express.Router();

// Lookup paths are internal only, used by squid for transparent proxy
router.post('/lookupip', lookup.lookupByIp);
router.post('/lookuphost', lookup.lookupHostName);
router.post('/api/addhost', lookup.addHostEntry);

module.exports = router;
