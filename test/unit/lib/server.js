'use strict';
const server = require('../../../lib/server');
const Controller = require('../../../lib/controller');
const Config = require('../../../lib/config');
const sandbox = require('sinon').createSandbox();

describe('server', function() {
    afterEach(function() {
        sandbox.restore();
    });
    it('start', function(done) {
        sandbox.stub(Controller.prototype, 'getKubeData').resolves({
            config: new Config({aclDatabaseFile: ':memory:'}),
            redisPass: 'abc123',
            tls: {
                cert: 'certdata'
            },
            nginx: {}
        });
        server.startup().then(() => {
            sandbox.stub(process, 'exit').withArgs(0).callsFake(() => {
                done();
            });
            // Stop app
            process.emit('SIGTERM');
        });
    });

    it('deploy nginx', function(done) {
        sandbox.stub(Controller.prototype, 'getKubeData').resolves({
            config: new Config({aclDatabaseFile: ':memory:'}),
            redisPass: 'abc123',
            tls: {
                cert: 'certdata'
            },
            nginx: null
        });
        sandbox.stub(Controller.prototype, 'deployNginx').resolves();
        sandbox.stub(Controller.prototype, 'pushConfig').resolves();
        server.startup().then(() => {
            sandbox.stub(process, 'exit').withArgs(0).callsFake(() => {
                done();
            });
            // Stop app
            process.emit('SIGTERM');
        });
    });

    it('error', function(done) {
        sandbox.stub(Controller.prototype, 'getKubeData').rejects(new Error('error message'));
        server.startup().then(() => {
            done();
        });
    });

    it('gracefulShutdown', async function() {
        await server.gracefulShutdown()
    });
});