'use strict'

const joi = require('joi');
const nconf = require('nconf');

function validate(config) {
    const schema = joi.object({
        localNetwork: joi.string().min(1).required(),
        squidConfigDir: joi.string().min(1).required(),
        e2guardianConfigDir: joi.string().min(1).required(),
        httpsEnabled: joi.bool().default(false),
        transparent: joi.bool().default(false),
        caInfo: joi.object({
            country: joi.string().min(1).required(),
            state: joi.string().min(1).required(),
            city: joi.string().min(1).required(),
            organization: joi.string().min(1).required(),
            organizationalUnit: joi.string().min(1).required(),
            commonName: joi.string().min(1).required(),
            email: joi.string().email().required()
        }).required()
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
        config.e2guardianConfigDir = nconf.get('E2GUARDIAN_CONFIG_DIR');
        config.httpsEnabled = nconf.get('HTTPS_ENABLED');
        config.transparent = nconf.get('TRANSPARENT');
        config.caInfo = {};
        config.caInfo.country = nconf.get('CERT_COUNTRY_CODE');
        config.caInfo.state = nconf.get('CERT_STATE');
        config.caInfo.city = nconf.get('CERT_CITY');
        config.caInfo.organization = nconf.get('CERT_ORGANIZATION');
        config.caInfo.organizationalUnit = nconf.get('CERT_ORGUNIT');
        config.caInfo.commonName = nconf.get('CERT_CN');
        config.caInfo.email = nconf.get('CERT_EMAIL');
    }

    const validatedConfig = validate(config);
	
    Object.assign(this, validatedConfig);
};

module.exports = Config;
