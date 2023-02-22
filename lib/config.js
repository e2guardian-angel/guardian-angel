'use strict'

const joi = require('joi');
const nconf = require('nconf');

function validate(config) {
    const schema = joi.object({
        safeSearchOverrides: joi.object().default({
            '213.180.193.56': 'yandex.com',
            '40.89.244.237': 'duckduckgo.com',
            '216.239.38.120': 'google.com',
            '216.239.38.119': 'youtube.com',
            '104.18.21.183': 'pixabay.com'
        }),
        configured: joi.boolean().default(true),
        httpPort: joi.number().min(1).max(65536).default(3000),
        redisConfig: joi.object({
            host: joi.string().min(1).default('redis'),
            port: joi.number().min(1).max(65535).default(6379),
            family: joi.number().valid(4, 6).optional(),
            password: joi.string().min(1).default(joi.ref('...REDIS_PASS')),
            errorLogDelay: joi.number().min(1000).default(3000)
        }).default(),
        cacheConfig: joi.object({
            ttl: joi.number().min(1).default(90),
            maxKeys: joi.number().min(100).default(8192)
        }).default(),
        dbConfig: joi.object({
            host: joi.string().min(1).default('guardian-db'),
            port: joi.number().min(1).max(65535).default(5432),
            user: joi.string().min(1).default('acluser'),
            password: joi.string().min(1).default(joi.ref('...POSTGRES_PASSWORD')),
            database: joi.string().min(1).default('acls')
        }).default(),
        REDIS_PASS: joi.string().min(1).required(),
        POSTGRES_PASSWORD: joi.string().min(1).required(),
        JWT_SECRET: joi.string().min(1).required()
    });
    return joi.attempt(config, schema, {allowUnknown: true, stripUnknown: true});
} // end validate

// Resolved config object
function Config() {
    // Read environment variables
    nconf.env('__');

    let config = nconf.get();

    const validatedConfig = validate(config);

    Object.assign(this, validatedConfig);
}

module.exports = Config;
