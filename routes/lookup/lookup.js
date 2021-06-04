'use strict'
const LookupDb = require('../../lib/lookup');
const Redis = require('ioredis');
const NodeCache = require('node-cache');
const nconf = require('nconf');
const Controller = require('../../lib/controller');

nconf.env('__');

let lookupDb;
let reverseCache;
let localCache;

/*
 * Just close/open redis; this way we won't have to reinitialize
 * everything on a reload
 */
const openRedis = async function(kubeData) {
    // Make a copy of redisConfig to protect secret data
    const redisConfig = JSON.parse(JSON.stringify(kubeData.config.redisConfig));
    if (kubeData.redisPass) {
        redisConfig.password = kubeData.redisPass;
    }
    reverseCache = new Redis(redisConfig);
}
const closeRedis = async function() {
    if (reverseCache) {
        await reverseCache.close();
        reverseCache = null;
    }
}

const finish = async function() {
    if (localCache) {
        await localCache.close();
    }
    await closeRedis();
    if (lookupDb) {
        await lookupDb.close();
    }
}

const init = async function(kubeData) {
    lookupDb = new LookupDb(kubeData.config);
    await lookupDb.init();

    if (kubeData.config.configured && kubeData.config.redisConfig) {
        await openRedis(kubeData)
        localCache = new NodeCache(kubeData.config.cacheConfig);
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
        const next = await reverseCache.get(cname);
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

    if (!reverseCache) {
        res.status(503).send('Redis cache not initialized');
        return;
    }

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

module.exports.init = init;
module.exports.openRedis = openRedis;
module.exports.closeRedis = closeRedis;
module.exports.finish = finish;
module.exports.lookupHostName = lookupByHostName;
module.exports.lookupByIp = lookupByIp;