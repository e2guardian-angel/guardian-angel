'use strict';
const Config = require('../../../lib/config');
const Controller = require('../../../lib/controller');
const expect = require('chai').expect;
const sandbox = require('sinon').createSandbox();
const fs = require('fs');
const nock = require('nock');
const mock = require('mock-require');
mock('ioredis', 'ioredis-mock');

let podsResponse = {
    items: [
        {metadata: {name: 'webfilter'}},
        {metadata: {name: 'redis'}},
        {metadata: {name: 'dns'}}
    ]
}

describe('/lib/controller', function() {
    process.env.KUBERNETES_BASE_URL = 'http://127.0.0.1:8080'

    describe('setConfig', function() {
        beforeEach(async function() {
            let controller = new Controller();
            controller.clearKubeData();
        });
        it('valid', function() {
            let controller = new Controller();
            let before = new Config({});
            controller.setConfig(before);
            let after = controller.getConfig();
            expect(JSON.stringify(before)).eql(JSON.stringify(after));
        });
        it('invalid', function() {
            let controller = new Controller();
            let config = {decryptRules: 'invalidValue'};
            let error = null;
            try {
                controller.setConfig(config);
            } catch (err) {
                error = err;
            }
            expect(error).not.null;
        });
    });
    describe('getDefaultOptions', function() {
        beforeEach(function() {
            let controller = new Controller();
            controller.clearKubeData();
        });
        it('service account', async function() {
            let realExistsSync = fs.existsSync;
            let realReadFileSync = fs.readFileSync;
            let fakeExistsSync = function(filename) {
                if (filename === '/var/run/secrets/kubernetes.io/serviceaccount/token' ||
                    filename === '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt') {
                    return true;
                } else {
                    return realExistsSync(filename)
                }
            };
            let fakeReadFileSync = function(filename, options) {
                if (filename === '/var/run/secrets/kubernetes.io/serviceaccount/token' ||
                    filename === '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt') {
                    return 'data';
                } else {
                    return realReadFileSync(filename, options)
                }
            }
            sandbox.stub(fs, 'existsSync').callsFake(fakeExistsSync);
            sandbox.stub(fs, 'readFileSync').callsFake(fakeReadFileSync);
            let controller = new Controller();
            let defaultOptions = controller.getDefaultOptions();
            sandbox.restore();
            expect(defaultOptions.headers.Authorization).eql('Bearer data');
            expect(defaultOptions.https.certificateAuthority).eql('data');
        });
    });
    describe('pushConfig', function() {
        beforeEach(async function() {
            let controller = new Controller();
            controller.clearKubeData();
        });
        it('valid', async function() {
            let controller = new Controller();
            nock(process.env.KUBERNETES_BASE_URL)
                .get(`/${controller.paths.resources.configs.config}`)
                .reply(404);

            nock(process.env.KUBERNETES_BASE_URL)
                .post(`/${controller.paths.kube.configMaps}`)
                .reply(201);

            let config = new Config({});
            controller.setConfig(config);
            await controller.initializeSecrets();
            await controller.pushConfig();
        });
        it('config not set', async function() {
            let controller = new Controller();

            let error = null;
            try {
                await controller.pushConfig();
            } catch (err) {
                error = err;
            }
            expect(error).not.null;
        });
        it('no redis pass', async function() {
            let controller = new Controller();

            let config = new Config({});
            controller.setConfig(config);
            let error = null;
            try {
                await controller.pushConfig();
            } catch (err) {
                error = err;
            }
            expect(error).not.null;
        });
        it('bad status', async function() {
            let controller = new Controller();
            nock(process.env.KUBERNETES_BASE_URL)
                .get(`/${controller.paths.resources.configs.config}`)
                .reply(404);

            nock(process.env.KUBERNETES_BASE_URL)
                .post(`/${controller.paths.kube.configMaps}`)
                .reply(401);

            let config = new Config({});
            controller.setConfig(config);
            await controller.initializeSecrets();
            let error = null;
            try {
                await controller.pushConfig();
            } catch (err) {
                error = err;
            }
            expect(error).not.null;
        });
        it('replace', async function() {
            let config = new Config({});
            let controller = new Controller();
            nock(process.env.KUBERNETES_BASE_URL)
                .get(`/${controller.paths.resources.configs.config}`)
                .reply(200, {data: config});

            nock(process.env.KUBERNETES_BASE_URL)
                .put(`/${controller.paths.resources.configs.config}`)
                .reply(201);

            controller.setConfig(config);
            await controller.initializeSecrets();
            const res = await controller.pushConfig();
            expect(res).eql(201);
        });
    });
    describe('pullConfig', function() {
        beforeEach(async function() {
            let controller = new Controller();
            controller.clearKubeData();
        });
        it('valid', async function() {
            let controller = new Controller();
            let config = new Config({});
            nock(process.env.KUBERNETES_BASE_URL)
                .get(`/${controller.paths.resources.configs.config}`)
                .reply(200, {data: {'guardian.json': JSON.stringify(config)}});

            await controller.pullConfig();
            const fetched = controller.getConfig();
            expect(JSON.stringify(fetched)).eql(JSON.stringify(config));
        });
        it('moved', async function() {
            let controller = new Controller();
            let config = new Config({});
            nock(process.env.KUBERNETES_BASE_URL)
                .get(`/${controller.paths.resources.configs.config}`)
                .reply(302);

            let result = await controller.pullConfig();
            expect(result).null;
        });
        it('not found', async function() {
            let controller = new Controller();
            let config = new Config({});
            nock(process.env.KUBERNETES_BASE_URL)
                .get(`/${controller.paths.resources.configs.config}`)
                .reply(404);

            const fetched = await controller.pullConfig();
            expect(fetched).eql(null);
        })
    });
    describe('pushRedisPassword', function() {
        beforeEach(async function() {
            let controller = new Controller();
            controller.clearKubeData();
        });
        it('valid', async function() {
            const controller = new Controller();
            let before = 'abc123abc123abc123abc123abc123abc123abc1';
            controller.setRedisPassword(before);
            nock(process.env.KUBERNETES_BASE_URL)
                .get(`/${controller.paths.resources.secrets.redisPass}`)
                .reply(404);

            nock(process.env.KUBERNETES_BASE_URL)
                .post(`/${controller.paths.kube.secrets}`)
                .reply(201);
            await controller.pushRedisPassword();
            let after = controller.getRedisPassword();
            expect(after).eql(before);
        });
        it('password not set', async function() {
            const controller = new Controller();
            let error = null;
            try {
                await controller.pushRedisPassword();
            } catch (err) {
                error = err;
            }
            expect(error).not.null;
        });
        it('error', async function() {
            const controller = new Controller();
            let pass = 'abc123abc123abc123abc123abc123abc123abc1';
            controller.setRedisPassword(pass);
            nock(process.env.KUBERNETES_BASE_URL)
                .get(`/${controller.paths.resources.secrets.redisPass}`)
                .reply(404);

            nock(process.env.KUBERNETES_BASE_URL)
                .post(`/${controller.paths.kube.secrets}`)
                .reply(401);
            let error = null;
            try {
                await controller.pushRedisPassword();
            } catch (err) {
                error = err;
            }
            expect(error).not.null;
        });
    });
    describe('pullRedisPassword', function() {
        beforeEach(async function() {
            let controller = new Controller();
            controller.clearKubeData();
        });
        it('error', async function() {
            const controller = new Controller();
            nock(process.env.KUBERNETES_BASE_URL)
                .get(`/${controller.paths.resources.secrets.redisPass}`)
                .reply(404);
            const result = await controller.pullRedisPassword();
            expect(result).null;
        });
    });
    describe('pushTLS', function() {
        beforeEach(async function() {
            let controller = new Controller();
            controller.clearKubeData();
        });
        it('valid', async function() {
            const controller = new Controller();
            let tlsDataBefore = {
                'key': 'keyData',
                'cert': 'certData'
            };
            controller.setTLS(tlsDataBefore);
            nock(process.env.KUBERNETES_BASE_URL)
                .get(`/${controller.paths.resources.secrets.tls}`)
                .reply(404);

            nock(process.env.KUBERNETES_BASE_URL)
                .post(`/${controller.paths.kube.secrets}`)
                .reply(201);
            await controller.pushTLS();
            let tlsDataAfter = controller.getTLS();
            expect(tlsDataAfter.key).undefined;
        });
        it('tls not set', async function() {
            const controller = new Controller();
            controller.setTLS({
                cert: 'abc123',
                key: 'abc123'
            });
            nock(process.env.KUBERNETES_BASE_URL)
                .get(`/${controller.paths.resources.secrets.tls}`)
                .reply(404);
            nock(process.env.KUBERNETES_BASE_URL)
                .post(`/${controller.paths.kube.secrets}`)
                .reply(201);
            await controller.pushTLS();
            nock(process.env.KUBERNETES_BASE_URL)
                .get(`/${controller.paths.resources.secrets.tls}`)
                .reply(200, {data: {
                        'tls.crt': 'data1',
                        'tls.key': 'data2'
                    }});
            await controller.pullTLS();
            // Try to push again, tls.key should not be set
            const result = await controller.pushTLS();
            expect(result).null;
        });
        it('error', async function() {
            const controller = new Controller();
            controller.setTLS({
                cert: 'abc123',
                key: 'abc123'
            });
            nock(process.env.KUBERNETES_BASE_URL)
                .get(`/${controller.paths.resources.secrets.tls}`)
                .reply(404);
            nock(process.env.KUBERNETES_BASE_URL)
                .post(`/${controller.paths.kube.secrets}`)
                .reply(401);
            let error = null;
            try {
                await controller.pushTLS();
            } catch (err) {
                error = err;
            }
            expect(error).not.null;
        });
    });
    describe('pullTLS', function() {
        beforeEach(async function() {
            let controller = new Controller();
            controller.clearKubeData();
        });
        it('error', async function() {
            const controller = new Controller();
            nock(process.env.KUBERNETES_BASE_URL)
                .get(`/${controller.paths.resources.secrets.tls}`)
                .reply(404).persist(true);
            const result = await controller.pullTLS();
            expect(result).null;
        });
    });
    describe('kubeApplyService', function() {
        beforeEach(async function() {
            let controller = new Controller();
            controller.clearKubeData();
        });
        it('valid', async function() {
            const controller = new Controller();
            let resource = controller.resources.services.webfilter;
            const config = new Config({});
            controller.setConfig(config);
            nock(process.env.KUBERNETES_BASE_URL)
                .get(`/${controller.paths.resources.services.webfilter}`)
                .reply(200, {
                    metadata: {
                        resourceVersion: '1'},
                    spec: {
                        clusterIP: '1.1.1.1',
                        clusterIPs: ['1.1.1.1']
                    }});
            nock(process.env.KUBERNETES_BASE_URL)
                .put(`/${controller.paths.resources.services.webfilter}`)
                .reply(201);
            await controller.kubeApplyService(controller.paths.kube.services,
                controller.paths.resources.services.webfilter, resource);
        });
        it('nonexistent', async function() {
            const controller = new Controller();
            let resource = controller.resources.services.webfilter;
            const config = new Config({});
            controller.setConfig(config);
            nock(process.env.KUBERNETES_BASE_URL)
                .get(`/${controller.paths.resources.services.webfilter}`)
                .reply(404);
            nock(process.env.KUBERNETES_BASE_URL)
                .post(`/${controller.paths.kube.services}`)
                .reply(201);
            await controller.kubeApplyService(controller.paths.kube.services,
                controller.paths.resources.services.webfilter, resource);
        });
        it('error', async function() {
            const controller = new Controller();
            let resource = controller.resources.services.webfilter;
            const config = new Config({});
            controller.setConfig(config);
            nock(process.env.KUBERNETES_BASE_URL)
                .get(`/${controller.paths.resources.services.webfilter}`)
                .reply(404);
            nock(process.env.KUBERNETES_BASE_URL)
                .post(`/${controller.paths.kube.services}`)
                .reply(401);
            let error = null;
            try {
                await controller.kubeApplyService(controller.paths.kube.services,
                    controller.paths.resources.services.webfilter, resource);
            } catch (err) {
                error = err;
            }
            expect(error).not.null;
        });
    });
    describe('kubeDeleteIfExists', function() {
        beforeEach(async function() {
            let controller = new Controller();
            controller.clearKubeData();
        });
        it('valid - exists', async function() {
            let controller = new Controller();
            const config = new Config({});
            nock(process.env.KUBERNETES_BASE_URL)
                .get(`/${controller.paths.resources.configs.config}`)
                .reply(200, {data: {'guardian.json': JSON.stringify(config)}});
            nock(process.env.KUBERNETES_BASE_URL)
                .delete(`/${controller.paths.resources.configs.config}`)
                .reply(201);

            await controller.kubeDeleteIfExists(controller.paths.resources.configs.config);
        });
        it('valid - nonexistent', async function() {
            let controller = new Controller();
            nock(process.env.KUBERNETES_BASE_URL)
                .delete(`/${controller.paths.resources.configs.config}`)
                .reply(404);

            await controller.kubeDeleteIfExists(controller.paths.resources.configs.config);
        });
    });
    describe('deployAll', function() {
        beforeEach(async function() {
            let controller = new Controller();
            controller.clearKubeData();
        });
        it('success', async function() {
            let controller = new Controller();
            let config = new Config({});
            controller.setConfig(config);
            nock(process.env.KUBERNETES_BASE_URL)
                .get(`/${controller.paths.kube.pods}`)
                .reply(200, podsResponse);
            nock(process.env.KUBERNETES_BASE_URL)
                .get(`/${controller.paths.resources.configs.config}`)
                .reply(200, {data: {'guardian.json': JSON.stringify(config)}});
            nock(process.env.KUBERNETES_BASE_URL)
                .put(`/${controller.paths.resources.configs.config}`)
                .reply(201);
            nock(process.env.KUBERNETES_BASE_URL)
                .post(`/${controller.paths.kube.configMaps}`)
                .reply(201)
            nock(process.env.KUBERNETES_BASE_URL)
                .get(`/${controller.paths.resources.secrets.redisPass}`)
                .reply(200, {data: {REDIS_PASS: 'YWJjMTIzCg=='}}).persist(true)
            nock(process.env.KUBERNETES_BASE_URL)
                .put(`/${controller.paths.resources.secrets.redisPass}`)
                .reply(201)
            nock(process.env.KUBERNETES_BASE_URL)
                .post(`/${controller.paths.kube.secrets}`)
                .reply(201)
            nock(process.env.KUBERNETES_BASE_URL)
                .get(`/${controller.paths.resources.secrets.tls}`)
                .reply(200, {data: {
                        'tls.crt': 'YWJjMTIzCg==',
                        'tls.key': 'YWJjMTIzCg=='
                    }}).persist(true);
            nock(process.env.KUBERNETES_BASE_URL)
                .put(`/${controller.paths.resources.secrets.tls}`)
                .reply(201)
            nock(process.env.KUBERNETES_BASE_URL)
                .post(`/${controller.paths.kube.deployments}`)
                .reply(201);
            nock(process.env.KUBERNETES_BASE_URL)
                .get(`/${controller.paths.resources.deployments.redis}`)
                .reply(200);
            nock(process.env.KUBERNETES_BASE_URL)
                .put(`/${controller.paths.resources.deployments.redis}`)
                .reply(201);
            nock(process.env.KUBERNETES_BASE_URL)
                .get(`/${controller.paths.resources.deployments.dns}`)
                .reply(200);
            nock(process.env.KUBERNETES_BASE_URL)
                .put(`/${controller.paths.resources.deployments.dns}`)
                .reply(201);
            nock(process.env.KUBERNETES_BASE_URL)
                .get(`/${controller.paths.resources.deployments.webfilter}`)
                .reply(200);
            nock(process.env.KUBERNETES_BASE_URL)
                .put(`/${controller.paths.resources.deployments.webfilter}`)
                .reply(201);
            nock(process.env.KUBERNETES_BASE_URL)
                .post(`/${controller.paths.kube.services}`)
                .reply(201);
            nock(process.env.KUBERNETES_BASE_URL)
                .get(`/${controller.paths.resources.services.redis}`)
                .reply(200, {
                    metadata: {
                        resourceVersion: '1'},
                    spec: {
                        clusterIP: '1.1.1.1',
                        clusterIPs: ['1.1.1.1']
                    }});
            nock(process.env.KUBERNETES_BASE_URL)
                .put(`/${controller.paths.resources.services.redis}`)
                .reply(201);
            nock(process.env.KUBERNETES_BASE_URL)
                .get(`/${controller.paths.resources.services.dns}`)
                .reply(200, {
                    metadata: {
                        resourceVersion: '1'},
                    spec: {
                        clusterIP: '1.1.1.1',
                        clusterIPs: ['1.1.1.1']
                    }});
            nock(process.env.KUBERNETES_BASE_URL)
                .put(`/${controller.paths.resources.services.dns}`)
                .reply(201);
            nock(process.env.KUBERNETES_BASE_URL)
                .get(`/${controller.paths.resources.services.webfilter}`)
                .reply(200, {
                    metadata: {
                        resourceVersion: '1'},
                    spec: {
                        clusterIP: '1.1.1.1',
                        clusterIPs: ['1.1.1.1']
                    }});
            nock(process.env.KUBERNETES_BASE_URL)
                .put(`/${controller.paths.resources.services.webfilter}`)
                .reply(201);
            nock(process.env.KUBERNETES_BASE_URL)
                .get(`/${controller.paths.kube.pods}/redis`)
                .reply(201);
            nock(process.env.KUBERNETES_BASE_URL)
                .get(`/${controller.paths.kube.pods}/dns`)
                .reply(201);
            nock(process.env.KUBERNETES_BASE_URL)
                .get(`/${controller.paths.kube.pods}/webfilter`)
                .reply(201);
            nock(process.env.KUBERNETES_BASE_URL)
                .delete(`/${controller.paths.kube.pods}/redis`)
                .reply(201);
            nock(process.env.KUBERNETES_BASE_URL)
                .delete(`/${controller.paths.kube.pods}/dns`)
                .reply(201);
            nock(process.env.KUBERNETES_BASE_URL)
                .delete(`/${controller.paths.kube.pods}/webfilter`)
                .reply(201);
            controller.pollUntilReady = async function () {};
            controller.getLookup().openRedis = function() {};
            await controller.deployAll();
        });
        it('404', async function() {
            let controller = new Controller();
            let config = new Config({});
            controller.setConfig(config);
            nock(process.env.KUBERNETES_BASE_URL)
                .get(`/${controller.paths.kube.pods}`)
                .reply(404, podsResponse);

            let error = null;
            try {
                await controller.deployAll();
            } catch (err) {
                error = err;
            }
            expect(error).not.null;
        });
    });
    describe('writeConfigFile', function() {
        beforeEach(async function() {
            let controller = new Controller();
            controller.clearKubeData();
        });
        it('valid', async function() {
            process.env.GUARDIAN_CONFIG_FILE = '/tmp/guardian.json';
            const config = new Config({});
            const controller = new Controller();
            controller.setConfig(config);
            controller.writeConfigFile();
        });
    });
});