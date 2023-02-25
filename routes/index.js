'use strict';

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Initialize multipart upload middleware
const appPrefix = 'guardian-angel';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), appPrefix));
const uploadDir = path.join(tmpDir, 'uploads');
const upload = multer({dest: uploadDir})

// Internal paths
const lookup = require('./lookup/lookup');

// Middlewware
const auth = require('./middleware/auth');
const listState = require('./middleware/listState');

const router = express.Router();

// Lookup paths are internal only, used by squid for transparent proxy
router.post('/lookupip', lookup.lookupByIp);
router.post('/lookuphost', lookup.lookupHostName);
router.post('/api/addhost', auth, lookup.addHostEntry);
router.post('/api/delhost', auth, lookup.deleteHostEntry);
router.post('/api/listCategories', auth, lookup.listCategories);
router.post('/api/deletecategory', auth, lookup.deleteCategory);
router.get('/api/cleanup', auth, lookup.cleanup);
//router.get('/api/installshalla', auth, lookup.installShallaLists);
//router.get('/api/installcapitole', auth, lookup.installCapitoleBlacklists);
router.post('/api/upload', auth, listState, upload.single('listfile'), lookup.installList);
router.get('/api/generateLists', auth, listState, lookup.generateLists);
router.get('/api/download', auth, listState, lookup.download);

module.exports = router;
