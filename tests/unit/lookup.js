'use strict'

const LookupTree = require('../../lib/lookup');
const expect = require('chai').expect;

describe('Tree', function() {
    describe('addHostName', function() {
        it('valid', async function() {
            let tree = new LookupTree();
            tree.addHostName('subdomain.mydomain.com', 'myCategory');
            expect(Object.keys(tree.children).length).gt(0);
            const entry = tree.lookupHostName('subdomain.mydomain.com');
            expect(entry.category).eql('myCategory');
        });
        it('empty', async function() {
            let tree = new LookupTree();
            let error = null;
            try {
                tree.addHostName('', 'myCategory');
            } catch (err) {
                error = err;
            }
            expect(error).is.not.null;
        });
        it('malformed', async function() {
            let tree = new LookupTree();
            let error = null;
            try {
                tree.addHostName('.subdomain.com', 'myCategory');
            } catch (err) {
                error = err;
            }
            expect(error).is.not.null;
        });
    });
    describe('lookupHostName', function() {
        it('subdomain', async function() {
            let tree = new LookupTree();
            tree.addHostName('mydomain.com', 'myCategory');
            expect(Object.keys(tree.children).length).gt(0);
            const entry = tree.lookupHostName('subdomain.mydomain.com');
            expect(entry.category).eql('myCategory');
        });
    });
});