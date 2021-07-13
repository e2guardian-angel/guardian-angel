'use strict';
const server = require('../../../lib/server');
const Config = require('../../../lib/config');
const sandbox = require('sinon').createSandbox();

describe('server', function() {
    afterEach(function() {
        sandbox.restore();
    });
    it('start', function(done) {
        server.startup().then(() => {
            sandbox.stub(process, 'exit').withArgs(0).callsFake(() => {
                done();
            });
            // Stop app
            process.emit('SIGTERM');
        });
    });
});