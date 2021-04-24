'use strict'

const Lookup = require('../../../lib/lookup');
const expect = require('chai').expect;

describe('Lookup', function() {
    let lookup = new Lookup({aclDatabaseFile: '/tmp/acls.db'});
    describe('addHostName', function() {
        beforeEach(async function() {
            await lookup.init();
        });
        afterEach(async function() {
            await lookup.cleanup();
            await lookup.close();
        });
        it('valid', async function() {
            await lookup.addHostName('subdomain.mydomain.com', 'myCategory');
            const result = await lookup.lookupHostName('subdomain.mydomain.com', 'myCategory');
            expect(result).to.not.be.undefined;
        });
        it('duplicate', async function() {
            lookup.addHostName('subdomain.mydomain.com', 'myCategory');
            lookup.addHostName('subdomain.mydomain.com', 'myCategory');
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
        beforeEach(async function() {
            await lookup.init();
        });
        afterEach(async function() {
            await lookup.cleanup();
            await lookup.close();
        });
        it('subdomain', async function() {
            await lookup.addHostName('mydomain.com', 'myCategory');
            const entry = await lookup.lookupHostName('subdomain.mydomain.com', 'myCategory');
            expect(entry.categoryText).eql('myCategory');
        });
    });
    describe('loadShallaDomains', function() {
        beforeEach(async function() {
            await lookup.init();
        });

        afterEach(async function() {
            await lookup.cleanup();
            await lookup.close();
        });
        it('valid', async function() {
            await lookup.loadDomainsFile(`${process.env.PWD}/test/unit/data/domains`, 'myCategory');
            const val = await lookup.lookupHostName('domain1.com', 'myCategory');
            expect(val).to.not.be.null;
        });
    });
});