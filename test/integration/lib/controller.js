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
                self.fail(`Test failed: ${err.message}`);
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
            } catch (err) {
                console.error(`Failed test: ${err.message}`);
                expect(err).to.be.null;
            }
            // Get all kube deployments and make sure they are as expected
            const pods = await controller.kubeGet(controller.paths.kube.pods);
            pods.body.items.forEach(pod => {
                if (pod.metadata.name.startsWith('webfilter')) {
                    // check to make sure that transocks is not deployed
                    let transocksContainer = pod.spec.containers.filter(container => container.name === 'transocks');
                    let e2guardianContainer = pod.spec.containers.filter(container => container.name === 'e2guardian');
                    expect(transocksContainer.length).eql(0);
                    expect(e2guardianContainer.length).eql(0);
                }
            });
        });
        it('ssl enabled', async function() {
            try {

            } catch(err) {
                console.error(`Failed test: ${err.message}`);
                expect(err).to.be.null;
            }
        });
    });
});