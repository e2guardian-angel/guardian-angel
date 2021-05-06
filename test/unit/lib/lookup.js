'use strict'

const Lookup = require('../../../lib/lookup');
const expect = require('chai').expect;

describe('Lookup', function() {
    let lookup = new Lookup({aclDatabaseFile: '/tmp/acls.db'});
    before(async function() {
        await lookup.init();
    });
    after(async function() {
        await lookup.cleanup();
        await lookup.close();
    });
    describe('addHostName', function() {
        it('valid', async function() {
            await lookup.addHostName('subdomain.mydomain.com', 'myCategory');
            const result = await lookup.lookupHostName('subdomain.mydomain.com', 'myCategory');
            expect(result).to.not.be.undefined;
        });
        it('all', async function() {
           await lookup.addHostName('subdomain.mydomain.com', 'myCategory');
           const result = await lookup.lookupHostName('subdomain.mydomain.com', 'any');
           expect(result).to.not.be.undefined;
        });
        it('duplicate', async function() {
            await lookup.addHostName('subdomain.mydomain.com', 'myCategory');
            await lookup.addHostName('subdomain.mydomain.com', 'myCategory');
            const result = await lookup.lookupHostName('subdomain.mydomain.com', 'myCategory');
            expect(result).to.not.be.undefined;
        });
        it('empty', async function() {
            let error = null;
            try {
                await lookup.addHostName('', 'myCategory');
            } catch (err) {
                error = err;
            }
            expect(error).is.not.null;
        });
        it('malformed', async function() {
            let error = null;
            try {
                await lookup.addHostName('.subdomain.com', 'myCategory');
            } catch (err) {
                error = err;
            }
            expect(error).is.not.null;
        });
    });
    describe('lookupHostName', function() {
        it('subdomain', async function() {
            await lookup.addHostName('mydomain.com', 'myCategory');
            const entry = await lookup.lookupHostName('subdomain.mydomain.com', 'myCategory');
            expect(entry.categoryText).eql('myCategory');
        });
    });
    describe('loadDomainsFile', function() {
        it('valid', async function() {
            await lookup.loadDomainsFile(`${process.env.PWD}/test/unit/data/category1/domains`, 'myCategory');
            const val = await lookup.lookupHostName('domain1.com', 'myCategory');
            expect(val).to.not.be.null;
        });
    });
    describe('loadDomainsDirectory', function() {
        it('valid', async function() {
            await lookup.loadDomainsDirectory(`${process.env.PWD}/test/unit/data/`);
            const val = await lookup.lookupHostName('anotherdomain.com', 'category2/subcategory');
            expect(val).to.not.be.null;
        })
    })
});