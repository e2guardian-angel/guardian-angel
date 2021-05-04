'use strict';

const express = require('express');
const lookup = require('./lookup/lookup');

const router = express.Router();

router.post('/lookupip', lookup.lookupByIp);
router.post('/lookuphost', lookup.lookupHostName);

module.exports = router;