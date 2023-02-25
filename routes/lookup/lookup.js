'use strict'
const LookupDb = require('../../lib/lookup');
const Redis = require('ioredis');
const NodeCache = require('node-cache');
const tar = require('tar');
const https = require('https');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const nconf = require('nconf');
const Semaphore = require('semaphore');
const multer = require('multer');
const retry = require('retry');

nconf.env('__');

let lookupDb;
let reverseCache;
let localCache;
const bulkSqlLock = new Semaphore(1);

const appPrefix = 'guardian-angel';
let tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), appPrefix));
let gaConfig;
let lastError = Date.now();

/*
 * Just close/open redis; this way we won't have to reinitialize
 * everything on a reload
 */
const openRedis = async function(config) {
    // Make a copy of redisConfig to protect secret data
    const redisConfig = JSON.parse(JSON.stringify(config.redisConfig));
    reverseCache = new Redis(redisConfig);

    // Don't dump too many error messages
    reverseCache.on('error', function() {
        const now = Date.now();
        if (now - lastError >= redisConfig.errorLogDelay) {
            console.log('Failed to connect redis, retrying...');
            lastError = now;
        }
    });

}

const closeRedis = async function() {
    if (reverseCache) {
        await reverseCache.disconnect();
        reverseCache = null;
    }
}

const finish = async function() {
    if (localCache) {
        await localCache.close();
        localCache = null;
    }
    await closeRedis();
    if (lookupDb) {
        await lookupDb.close();
        lookupDb = null;
    }
}

const init = async function(config) {
    gaConfig = config;
    lookupDb = new LookupDb();
    await lookupDb.init();

    if (config.configured && config.redisConfig) {
        await openRedis(config)
        localCache = new NodeCache(config.cacheConfig);
    }
}

const cacheLocally = function(key, value) {
    try {
        localCache.set(key, value);
    } catch (err) {
        console.info('Unable to cache lookup entry, reached maximum number of keys');
    }
}

const recursiveCnameLookup = async function(cname) {
    try {
        const next = gaConfig.safeSearchOverrides[cname] || await reverseCache.get(cname);
        return (next) ? await recursiveCnameLookup(next) : cname;
    } catch (err) {
        console.log('Failure during recursive CNAME lookup');
        return {match: false};
    }
}

const lookupByHostName = function(req, res) {

    const hostName = req.body.hostname;
    const category = req.body.category;

    if (!hostName || !category) {
        res.status(500).send('hostname or category not specified in request');
        return;
    }

    // Check local cache first
    const localResult = localCache.get(`${hostName}:${category}`);
    if (typeof(localResult) !== 'undefined') {
        res.send((typeof(localResult) === 'object') ? {match: true, result: localResult} : {match: false});
    } else {
        lookupDb.lookupHostName(hostName, category).then(result => {
            if (result) {
                cacheLocally(`${hostName}:${category}`, result);
                res.send({
                    match: true,
                    result: result
                });
            } else {
                cacheLocally(`${hostName}:${category}`, false);
                res.send({
                    match: false
                });
            }
        });
    }
}

const cleanup = async function(req, res) {
    await lookupDb.cleanup();
    await lookupDb.init();
    res.status(200).send('OK');
}

const lookupByIp = function(req, res) {

    if (!reverseCache) {
        res.status(503).send('Redis cache not initialized');
        return;
    }

    const ip = req.body.ip;
    const category = req.body.category;

    if (!ip || !category) {
        res.status(500).send('IP addres or category not specified in request');
        return;
    }

    // Check local cache first
    const localResult = localCache.get(`${ip}:${category}`);
    if (typeof(localResult) !== 'undefined') {
        res.send((typeof(localResult) === 'object') ? {match: true, result: localResult} : {match: false});
    } else {
        recursiveCnameLookup(ip).then(hostName => {
            if (hostName !== ip) {
                lookupDb.lookupHostName(hostName, category).then(result => {
                    if (result) {
                        cacheLocally(`${ip}:${category}`, result);
                        res.send({
                            match: true,
                            result: result
                        });
                    } else {
                        cacheLocally(`${ip}:${category}`, false);
                        res.send({
                            match: false
                        });
                    }
                });
            } else {
                let response = {};
                // Allow an ip_miss category for IPs that aren't cached
                // in redis for some reason
                if (category === 'ip_miss') {
                    response.match = true;
                    response.result = {ip: ip, category: 'ip_miss'};
                } else {
                    response.match = false;
                }
                cacheLocally(`${ip}:${category}`, response.match);
                res.send(response);
            }
        });
    }
}

const addHostEntry = async function(req, res) {

    const hostName = req.body.hostname;
    const category = req.body.category;

    if (!hostName || !category) {
        res.status(500).send('hostname or category not specified in request');
        return;
    }

    try {
        await lookupDb.addHostName(hostName, category);
        res.status(200).send('OK');
    } catch (err) {
        res.status(500).send(err);
    }
}

const listCategories = async function(req, res) {
    
    let hostName = '';
    if (req.body && req.body.hostname) {
        hostName = req.body.hostname;
    }

    try {
        const categories = await lookupDb.listCategories(hostName);
        res.setHeader('content-type', 'application/json');
        res.status(200).send(JSON.stringify(categories));
    } catch (err) {
        res.status(500).send(err);
    }
}

const deleteHostEntry = async function(req, res) {

    const hostName = req.body.hostname;
    const category = req.body.category;

    if (!hostName || !category) {
        res.status(500).send('hostname or category not specified in request');
        return;
    }

    try {
        await lookupDb.deleteHostname(hostName, category);
        res.status(200).send('OK');
    } catch (err) {
        res.status(500).send(err);
    }
}

const deleteCategory = async function(req, res) {

    const category = req.body.category;

    if (!category) {
        res.status(500).send('category not specified in request');
        return;
    }

    try {
        await lookupDb.deleteCategory(category);
        res.status(200).send('OK');
    } catch (err) {
        res.status(500).send(err);
    }
}

const downloadAndInstall = async function(url, destDir, downloadFileName, unpackdir) {
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir);
    }

    if (fs.existsSync(path.join(destDir, unpackdir))) {
        // Already downloaded
        return await lookupDb.loadDomainsDirectory(path.join(destDir, unpackdir));
    }

    const file = fs.createWriteStream(path.join(destDir, downloadFileName));
    console.info(`Downloading ${downloadFileName}...`);
    const downloader = (url.indexOf('https') >= 0) ? https : http;

    const parsedUrl = new URL(url);
    const options = {
        host: parsedUrl.host,
        path: parsedUrl.pathname,
        family: 4
    };
    if (parsedUrl.port) {
        options.port = parsedUrl.port;
    }

    await downloader.get(options,
        function(response) {
            response.pipe(file);
            file.on('finish', async function() {
                file.close();
                console.info('Download complete.')
                await tar.x({
                    file: file.path,
                    gzip: true,
                    cwd: destDir
                });
                fs.unlinkSync(file.path);
                bulkSqlLock.take(async function() {
                    await lookupDb.loadDomainsDirectory(path.join(destDir, unpackdir));
                    bulkSqlLock.leave();
                });
            });
        });
}

const installShallaLists = async function(req, res) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), appPrefix));
    const destDir = path.join(tmpDir, 'shalla');
    downloadAndInstall(
        'https://web.archive.org/web/20210502020725if_/http://www.shallalist.de/Downloads/shallalist.tar.gz',
        destDir,
        'shallalist.tar.gz',
        'BL'
    );

    res.status(200).send('OK');
}

const installList = async function(req, res) {
    console.log('Body: ' + JSON.stringify(req.file));
    const filePath = req.file.path;
    const containingDir = filePath.replace(path.basename(filePath), '');
    const outputDir = path.join(containingDir, 'listdir');
    fs.mkdirSync(outputDir);
    const parts = req.file.originalname.split('.');
    if (parts.indexOf('tar') < 0 && parts.indexOf('tgz') < 0) {
        return res.status(500).send('Invalid file format; expected .tar, .tar.gz or .tgz');
    }
    const gz = parts.indexOf('gz') > 0 || parts.indexOf('tgz') > 0;
    try {
        await tar.x({
            file: filePath,
            gzip: gz,
            cwd: outputDir
        });
        // If there is only one directory in the extracted path, that is the root.
        const lsDir = fs.readdirSync(outputDir);
        let listDir = outputDir;
        if (lsDir.length == 1) {
            listDir = path.join(outputDir, lsDir[0]);
        }
        lookupDb.loadDomainsDirectory(listDir);
        return res.status(200).send('OK');
    } catch (err) {
        res.status(500).send('Invalid file format');
    }
    
}

module.exports.init = init;
module.exports.cacheLocally = cacheLocally;
module.exports.recursiveCnameLookup = recursiveCnameLookup;
module.exports.openRedis = openRedis;
module.exports.closeRedis = closeRedis;
module.exports.finish = finish;
module.exports.lookupHostName = lookupByHostName;
module.exports.lookupByIp = lookupByIp;
module.exports.cleanup = cleanup;
module.exports.addHostEntry = addHostEntry;
module.exports.deleteHostEntry = deleteHostEntry;
module.exports.listCategories = listCategories;
module.exports.deleteCategory = deleteCategory;
module.exports.installList = installList;