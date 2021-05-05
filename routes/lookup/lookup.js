'use strict'
const LookupDb = require('../../lib/lookup');
const Redis = require('ioredis');
const NodeCache = require('node-cache');

let lookupDb;
let reverseCache;
let localCache;

const init = function(config) {
    lookupDb = new LookupDb(config);
    lookupDb.init();
    reverseCache = new Redis(config.redisConfig);
    localCache = new NodeCache(config.cacheConfig);
}

const cacheLocally = function(key, value) {
    try {
        localCache.set(key, value);
    } catch (err) {
        console.info('Unable to cache lookup entry, reached maximum number of keys');
    }
}

const lookupByHostName = function(req, res) {
    const hostName = req.body.hostname;
    const category = req.body.category;

    if (!hostName || !category) {
        res.sendStatus(500);
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

const lookupByIp = function(req, res) {
    const ip = req.body.ip;
    const category = req.body.category;

    if (!ip || !category) {
        res.sendStatus(500);
        return;
    }

    // Check local cache first
    const localResult = localCache.get(`${ip}:${category}`);
    if (typeof(localResult) !== 'undefined') {
        res.send((typeof(localResult) === 'object') ? {match: true, result: localResult} : {match: false});
    } else {
        reverseCache.get(ip).then(hostName => {
            if (hostName) {
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
                cacheLocally(`${ip}:${category}`, false);
                res.send({
                    match: false
                });
            }
        });
    }
}

module.exports.init = init;
module.exports.lookupHostName = lookupByHostName;
module.exports.lookupByIp = lookupByIp;