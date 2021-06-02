'use strict'

const Lookup = require('../../../lib/lookup');
const expect = require('chai').expect;
const fs = require('fs');
const sandbox = require('sinon').createSandbox();
const sqlite = require('sqlite');

let fakeDb = {
    run: async function() { return ''; },
    get: async function() { return ''; },
    finalize: async function() { return ''; },
    prepare: async function() { return ''; }
};

let createDbConnection = function() {
    return fakeDb;
}

describe('Lookup', function() {
    describe('createDbConnection', function() {
       it('nonexistent file', async function() {
          let l = new Lookup({aclDatabaseFile: '/tmp/file.db'});
          await l.init();
          fs.rmSync('/tmp/file.db');
       });
    });
    describe('init', function() {
        it('twice', async function() {
            let l = new Lookup({aclDatabaseFile: ':memory:'});
            await l.init();
            await l.close();
            await l.init();
            await l.close();
        });
        it('twice without close ', async function() {
            let l = new Lookup({aclDatabaseFile: ':memory:'});
            await l.init();
            let error;
            try {
                await l.init();
            } catch (err) {
                error = err;
            }
            await l.close();
            expect(error).not.null;
        });
        it('sql error', async function() {
            let l = new Lookup({aclDatabaseFile: ':memory:'});
            l.createDbConnection = function() {
                return Promise.resolve({
                    run: async function() { return Promise.reject(new Error('error')); }
                });
            };
            await l.init();
        });
    });
    describe('close', function() {
        it('error', async function() {
            let l = new Lookup({aclDatabaseFile: ':memory:'});
            await l.init();
            l.db = {
                close: function() {
                    return Promise.reject(new Error('error'));
                }
            }
            await l.close();
        });
    });
    describe('cleanup', function() {
        it('no init', async function() {
            let l = new Lookup({aclDatabaseFile: ':memory:'});
            let error;
            try {
                await l.cleanup();
            } catch (err) {
                error = err;
            }
            expect(error).not.null;
        });
        it('valid', async function() {
            let l = new Lookup({aclDatabaseFile: ':memory:'});
            await l.init();
            await l.cleanup();
        });
    });
    describe('close', function() {
        it('no init', async function() {
            let l = new Lookup({aclDatabaseFile: ':memory:'});
            let error;
            try {
                await l.close();
            } catch (err) {
                error = err;
            }
            expect(error).not.null;
        });
        it('error on close', async function() {
            let l = new Lookup({aclDatabaseFile: ':memory:'});
            l.initialized = true;
            let fakeDb = {
                close: function() {
                    throw new Error('error message');
                }
            }
            sandbox.stub(l, 'createDbConnection').returns(fakeDb);
            let error;
            try {
                await l.close();
            } catch (err) {
                error = err;
            }
            expect(error).not.null;
        });
    });
    describe('addHostName', function() {
        it('valid', async function() {
            let l = new Lookup({aclDatabaseFile: ':memory:'});
            await l.init();
            await l.addHostName('subdomain.mydomain.com', 'myCategory');
            const result = await l.lookupHostName('subdomain.mydomain.com', 'myCategory');
            expect(result).to.not.be.undefined;
        });
        it('all', async function() {
            let l = new Lookup({aclDatabaseFile: ':memory:'});
            await l.init();
            await l.addHostName('subdomain.mydomain.com', 'myCategory');
            const result = await l.lookupHostName('subdomain.mydomain.com', 'any');
            expect(result).to.not.be.undefined;
        });
        it('no init', async function() {
            let l = new Lookup({aclDatabaseFile: 'filename'});
            let error;
            try {
                await l.addHostName('subdomain.mydomain.com', 'any');
            } catch(err) {
                error = err;
            }
            expect(error).not.null;
        });
        it('duplicate', async function() {
            let l = new Lookup({aclDatabaseFile: ':memory:'});
            await l.init();
            await l.addHostName('subdomain.mydomain.com', 'myCategory');
            await l.addHostName('subdomain.mydomain.com', 'myCategory');
            const result = await l.lookupHostName('subdomain.mydomain.com', 'myCategory');
            expect(result).to.not.be.undefined;
        });
        it('empty', async function() {
            let l = new Lookup({aclDatabaseFile: ':memory:'});
            await l.init();
            let error = null;
            try {
                await l.addHostName('', 'myCategory');
            } catch (err) {
                error = err;
            }
            expect(error).is.not.null;
        });
        it('malformed', async function() {
            let l = new Lookup({aclDatabaseFile: ':memory:'});
            await l.init();
            let error = null;
            try {
                await l.addHostName('.subdomain.com', 'myCategory');
            } catch (err) {
                error = err;
            }
            expect(error).is.not.null;
        });
        it('db error', async function() {
            let l = new Lookup({aclDatabaseFile: ':memory:'});
            await l.init();
            sandbox.stub(l.db, 'run').rejects(new Error('error message'));
            let error;
            try {
                await l.addHostName('subdomain.mydomain.com', 'any');
            } catch (err) {
                error = err;
            }
            sandbox.restore();
            expect(error).not.null;
        });
    });
    describe('lookupHostName', function() {
        it('subdomain', async function() {
            let l = new Lookup({aclDatabaseFile: ':memory:'});
            await l.init();
            await l.addHostName('mydomain.com', 'myCategory');
            const entry = await l.lookupHostName('subdomain.mydomain.com', 'myCategory');
            expect(entry.categoryText).eql('myCategory');
        });
        it('no init', async function() {
            let l = new Lookup({aclDatabaseFile: 'filename'});
            let error;
            try {
                await l.lookupHostName('subdomain.mydomain.com', 'any');
            } catch(err) {
                error = err;
            }
            expect(error).not.null;
        });
        it('db error', async function() {
            let l = new Lookup({aclDatabaseFile: ':memory:'});
            await l.init();
            sandbox.stub(l.db, 'get').rejects(new Error('error message'));
            let error;
            try {
                await l.lookupHostName('subdomain.mydomain.com', 'any');
            } catch (err) {
                error = err;
            }
            sandbox.restore();
            expect(error).not.null;
        });
    });
    describe('loadDomainsFile', function() {
        it('valid', async function() {
            let l = new Lookup({aclDatabaseFile: ':memory:'});
            await l.init();
            await l.loadDomainsFile(`${process.env.PWD}/test/unit/data/category1/domains`, 'myCategory');
            const val = await l.lookupHostName('domain1.com', 'myCategory');
            expect(val).to.not.be.null;
        });
        it('twice', async function() {
            let l = new Lookup({aclDatabaseFile: ':memory:'});
            await l.init();
            await l.loadDomainsFile(`${process.env.PWD}/test/unit/data/category1/domains`, 'myCategory');
            const val = await l.lookupHostName('domain1.com', 'myCategory');
            expect(val).to.not.be.null;
            let error = null;
            // Constraint errors should be handled, no error thrown
            l.loadDomainsFile(`${process.env.PWD}/test/unit/data/category1/domains`, 'myCategory');
        })
        it('no init', async function() {
            let l = new Lookup({ aclDatabaseFile: 'filename' });
            let error;
            try {
                l.loadDomainsFile(`${process.env.PWD}/test/unit/data/category1/domains`, 'myCategory');
            } catch (err) {
                error = err;
            }
            expect(error).not.null;
        });
        it('db error', async function() {
            let l = new Lookup({ aclDatabaseFile: 'filename' });
            l.createDbConnection = function() {
                return Promise.resolve({
                    run: function () {
                        return Promise.resolve();
                    },
                    get: function () {
                        return Promise.resolve({id: 1});
                    },
                    prepare: function () {
                        return Promise.resolve({
                            run: function () {
                                let e = new Error('error');
                                e.errno = 20;
                                return Promise.reject(e);
                            },
                            finalize: function () {
                                return Promise.resolve();
                            }
                        });
                    }
                });
            }
            await l.init();
            let error;
            try {
                l.loadDomainsFile(`${process.env.PWD}/test/unit/data/category1/domains`, 'myCategory');
            } catch (err) {
                error = err;
            }
            expect(error).not.null;
        });
    });
    describe('loadDomainsDirectory', function() {
        it('valid', async function() {
            let l = new Lookup({aclDatabaseFile: '/tmp/acls.db'});
            await l.init();
            await l.loadDomainsDirectory(`${process.env.PWD}/test/unit/data/`);
            const val = await l.lookupHostName('anotherdomain.com', 'category2/subcategory');
            expect(val).to.not.be.null;
        });
        it('no init', async function() {
            let l = new Lookup({aclDatabaseFile: 'aclfile'});
            let error;
            try {
                await l.loadDomainsDirectory(`${process.env.PWD}/test/unit/data/`);
            } catch (err) {
                error = err;
            }
            expect(error).not.null;
        });
    })
});