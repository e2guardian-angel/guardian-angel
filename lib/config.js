'use strict'

const joi = require('joi');
const nconf = require('nconf');

function validate(config) {
    const schema = joi.object({
        localNetwork: joi.string().min(1).required(),
        squidConfigDir: joi.string().min(1).default('/etc/squid'),
        proxyPort: joi.number().min(1).max(65535).default(3128),
        e2guardianConfigDir: joi.string().min(1).default('/etc/e2guardian'),
        httpsEnabled: joi.bool().default(false),
        httpPort: joi.number().min(1).max(65536).default(3000),
        httpsPort: joi.number().min(1).max(65536).default(3443),
        transparent: joi.bool().default(false),
        sslBumpEnabled: joi.bool().default(false),
        aclDatabaseFile: joi.string().min(1).default('/opt/guardian/acls.db'),
        allowRules: joi.array().items(joi.object({
            category: joi.string().min(1).required(),
            allow: joi.boolean().required()
        })).default([]),
        decryptRules: joi.array().items(joi.object({
            category: joi.string().min(1).required(),
            decrypt: joi.boolean().required()
        })).default([]),
        caInfo: joi.object({
            country: joi.string().min(1).default('US'),
            state: joi.string().min(1).default('TX'),
            city: joi.string().min(1).default('Austin'),
            organization: joi.string().min(1).default('GuardianAngel'),
            organizationalUnit: joi.string().min(1).default('RootCerts'),
            commonName: joi.string().min(1).default('guardian.angel'),
            email: joi.string().email().default('guardian.angel@example.com')
        }).default(),
        redisConfig: joi.object({
            host: joi.string().min(1).required(),
            port: joi.number().min(1).max(65535).default(6379),
            family: joi.number().valid(4, 6).optional(),
            password: joi.string().min(1).optional()
        }).default(),
        cacheConfig: joi.object({
            ttl: joi.number().min(1).default(90),
            maxKeys: joi.number().min(100).default(8192)
        }).default()
    });
    return joi.attempt(config, schema, {allowUnknown: true, stripUnknown: true});
} // end validate

// Resolved config object
function Config(info) {
    // Read environment variables
    nconf.env('__');

    let config = {}
    if (info) {
        config = info;
    } else {
        config.localNetwork = nconf.get('LOCAL_NETWORK');
        config.squidConfigDir = nconf.get('SQUID_CONFIG_DIR');
        config.proxyPort = nconf.get('SQUID_PROXY_PORT');
        config.e2guardianConfigDir = nconf.get('E2GUARDIAN_CONFIG_DIR');
        config.httpsEnabled = nconf.get('HTTPS_ENABLED');
        config.transparent = nconf.get('TRANSPARENT');
        config.sslBumpEnabled = nconf.get('SSL_BUMP_ENABLED');
        config.caInfo = {};
        config.caInfo.country = nconf.get('CERT_COUNTRY_CODE');
        config.caInfo.state = nconf.get('CERT_STATE');
        config.caInfo.city = nconf.get('CERT_CITY');
        config.caInfo.organization = nconf.get('CERT_ORGANIZATION');
        config.caInfo.organizationalUnit = nconf.get('CERT_ORGUNIT');
        config.caInfo.commonName = nconf.get('CERT_CN');
        config.caInfo.email = nconf.get('CERT_EMAIL');
        config.redisConfig = {};
        config.redisConfig.host = nconf.get('REDIS_HOST');
    }

    const validatedConfig = validate(config);
	
    Object.assign(this, validatedConfig);
}

module.exports = Config;
