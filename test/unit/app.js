'use strict';
const server = require('../../lib/server');
const sandbox = require('sinon').createSandbox();

describe('app', function() {
    it('run', async function() {
        sandbox.stub(server, 'startup').returns();
        require('../../app');
        sandbox.restore();
    });
})