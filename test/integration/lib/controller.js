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
                await controller.tearDown();
                await controller.eraseKubeData();
            } catch (err) {
                assert(!err);
            }
            sandbox.stub(lookup, 'openRedis').resolves();
        });
        it('default config', async function() {
            try {
                await controller.getKubeData();
                await controller.deployAll();
                // Get all kube deployments and make sure they are as expected
            } catch (err) {
                assert(!err);
            }
        });
    });
});