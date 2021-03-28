'use strict'

const LookupTree = require('../../../lib/lookup');
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
        it('duplicate', async function() {
            let tree = new LookupTree();
            tree.addHostName('subdomain.mydomain.com', 'myCategory');
            let before = Object.keys(tree.children).length;
            tree.addHostName('subdomain.mydomain.com', 'myCategory');
            let after = Object.keys(tree.children).length;
            expect(before).eql(after);
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
        it('empty', async function() {
            let tree = new LookupTree();
            let error = null;
            try {
                tree.lookupHostName('');
            } catch (err) {
                error = err;
            }
            expect(error).is.not.null;
        });
        it('malformed', async function() {
            let tree = new LookupTree();
            let error = null;
            try {
                tree.lookupHostName('.subdomain.mydomain.com');
            } catch (err) {
                error = err;
            }
            expect(error).is.not.null;
        });
    });
    describe('addNode', function() {
       it('valid', function() {
           let tree = new LookupTree();
           tree.addNode('id1');
           expect(Object.keys(tree.children).length).gt(0);
       });
       it('duplicate', function() {
           let tree = new LookupTree();
           tree.addNode('id1');
           let error = null;
           try {
               tree.addNode('id1');
           } catch (err) {
               error = err;
           }
           expect(error).is.not.null;
       });
    });
});