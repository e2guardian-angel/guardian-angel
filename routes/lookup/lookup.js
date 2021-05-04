'use strict'
const LookupDb = require('../../lib/lookup');
const Redis = require('ioredis');

let lookupDb;
let reverseCache;

const init = function(config) {
    lookupDb = new LookupDb(config);
    lookupDb.init();
    reverseCache = new Redis(config.redisConfig);
}

const lookupByHostName = function(req, res) {
    const hostName = req.body.hostname;
    const category = req.body.category;
    lookupDb.lookupHostName(hostName, category).then(result => {
        if (result) {
            res.send({
                match: true,
                result: result
            });
        } else {
            res.send({
                match: false
            });
        }
    });
}

const lookupByIp = function(req, res) {
    const ip = req.body.ip;
    const category = req.body.category;
    reverseCache.get(ip).then(hostName => {
        if (hostName) {
            lookupDb.lookupHostName(hostName, category).then(result => {
                if (result) {
                    res.send({
                        match: true,
                        result: result
                    });
                } else {
                    res.send({
                        match: false
                    });
                }
            });
        } else {
            res.send({
                match: false
            });
        }
    });
}

module.exports.init = init;
module.exports.lookupHostName = lookupByHostName;
module.exports.lookupByIp = lookupByIp;