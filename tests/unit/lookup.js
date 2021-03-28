'use strict'

const LookupTree = require('../../lib/lookup');
const expect = require('chai').expect;

describe('Tree', function() {
    describe('addHostName', function() {
        it('valid', async function() {
            let tree = new LookupTree();
            tree.addHostName('subdomain.mydomain.com');
            expect(tree.children.length).gt(0);
        });
    });
});