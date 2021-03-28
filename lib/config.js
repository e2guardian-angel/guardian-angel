'use strict'

const joi = require('joi');
const nconf = require('nconf');

function validate(config) {
    const schema = joi.object({
	localNetwork: joi.string().min(1).required(),
	squidConfigPath: joi.string().min(1).required(),
	e2guardianConfigPath: joi.string().min(1).required(),
	httpsEnabled: joi.bool().default(false),
	transparent: joi.bool().default(false)
    });
    return joi.attempt(config, schema, {allowUnknown: true, stripUnknown: true});
} // end validate

// Resolved config object
function Config(config) {
    // Read environment variables
    nconf.env('__');

    config.localNetwork =
	(config.localNetwork)?config.localNetwork:nconf.get('LOCAL_NETWORK');
    config.squidConfigPath =
	(config.squidConfigPath)?config.squidConfigPath:nconf.get('SQUID_CONFIG_PATH');
    config.e2guardianConfigPath =
	(config.e2guardianConfigPath)?config.e2guardianConfigPath:nconf.get('E2GUARDIAN_CONFIG_PATH');
    const validatedConfig = validate(input);
	
    Object.assign(this, validatedConfig);
};

module.exports = new Config();
