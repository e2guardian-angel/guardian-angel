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
                    // Only squid container should be deployed
                    expect(pod.spec.containers.length).eql(1);
                    expect(pod.spec.containers[0].name === 'squid')
                }
            });
            const services = await controller.kubeGet(controller.paths.kube.services);
            services.body.items.forEach(service => {
                if (service.metadata.name.startsWith('webfilter')) {
                    // check to make sure transocks port is not open
                    expect(service.spec.ports.length).eql(1);
                    expect(service.spec.ports[0].name === 'squid');
                }
            });
        });
        it('ssl enabled', async function() {
            try {
                let sslConfig = new Config({});
                sslConfig.sslBumpEnabled = true;
                // Pull kubeconfig
                console.info('Fetching kube data...');
                await controller.getKubeData();
                controller.setConfig(sslConfig);
                console.info('Deploying all objects...');
                await controller.deployAll();
                console.info('Done');
            } catch(err) {
                console.error(`Failed test: ${err.message}`);
                expect(err).to.be.null;
            }
            // Get all kube deployments and make sure they are as expected
            const pods = await controller.kubeGet(controller.paths.kube.pods);
            pods.body.items.forEach(pod => {
                if (pod.metadata.name.startsWith('webfilter')) {
                    // Only squid container should be deployed
                    expect(pod.spec.containers.length).eql(2);
                    let squidContainer = pod.spec.containers.filter(pod => pod.name.startsWith('squid'));
                    let e2gContainer = pod.spec.containers.filter(pod => pod.name.startsWith('e2guardian'));
                    expect(squidContainer.length).gt(0);
                    expect(e2gContainer.length).gt(0);
                }
            });
            const services = await controller.kubeGet(controller.paths.kube.services);
            services.body.items.forEach(service => {
                if (service.metadata.name.startsWith('webfilter')) {
                    // check to make sure transocks port is not open
                    expect(service.spec.ports.length).eql(1);
                    expect(service.spec.ports[0].name === 'squid');
                }
            });
        });
    });
});