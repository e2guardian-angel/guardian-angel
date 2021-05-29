'use strict';

const Controller = require('../../../lib/controller');
const Config = require('../../../lib/config');
const lookup = require('../../../routes/lookup/lookup');
const controller = new Controller();
const expect = require('chai').expect;
const assert = require('chai').assert;
const fs = require('fs');
const sandbox = require('sinon').createSandbox();

describe('/lib/controller', function() {
    describe('deployAll', function() {
        before(async function() {
            try {
                console.info('Tearing down...');
                await controller.tearDown();
                await controller.eraseKubeData();
                console.info('Waiting until ready...');
                await controller.pollUntilReady();
            } catch (err) {
                assert(!err);
            }
            sandbox.stub(lookup, 'openRedis').resolves();
        });
        it('default config', async function() {
            try {
                console.info('Fetching kube data...');
                await controller.getKubeData();
                console.info('Deploying all objects...');
                await controller.deployAll();
                console.info('Done');
                // Get all kube deployments and make sure they are as expected
            } catch (err) {
                assert(!err);
            }
        });
    });
});