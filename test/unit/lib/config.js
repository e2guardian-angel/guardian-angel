'use strict'
const Config = require('../../../lib/config');

describe('config.js', function() {
    const config = {
        localNetwork: '10.0.0.0/8',
        squidConfigDir: '/etc/squid',
        e2guardianConfigDir: '/etc/e2guardian',
        httpsEnabled: true,
        transparent: true,
        caInfo: {
            country: 'US',
            state: 'Texas',
            city: 'Austin',
            organization: 'BlueStar',
            organizationalUnit: 'NetworkSecurity',
            commonName: 'guardian-angel',
            email: 'admin@domain.net'
        },
        redisConfig: {
            host: '127.0.0.1'
        }
    }
    beforeEach(function() {
        process.env.LOCAL_NETWORK = '10.0.0.0/8';
        process.env.SQUID_CONFIG_DIR = '/etc/squid';
        process.env.E2GUARDIAN_CONFIG_DIR = '/etc/e2guardian';
        process.env.HTTPS_ENABLED = true;
        process.env.TRANSPARENT = true;
        process.env.CERT_COUNTRY_CODE = 'US';
        process.env.CERT_STATE = 'Texas';
        process.env.CERT_CITY = 'Austin';
        process.env.CERT_ORGANIZATION = 'BlueStar';
        process.env.CERT_ORGUNIT = 'NetworkSecurity';
        process.env.CERT_CN = 'guardian-angel';
        process.env.CERT_EMAIL = 'admin@domain.net';
        process.env.REDIS_HOST = '127.0.0.1';
    })
    describe('validate', function() {
        it('valid env', function() {
            new Config();
        });
        it('valid config', function() {
            new Config(config);
        })
    });
});