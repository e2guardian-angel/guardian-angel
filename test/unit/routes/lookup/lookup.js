'use strict';
const httpMocks = require('node-mocks-http');
const eventEmitter = require('events').EventEmitter;
const Redis = require('ioredis');
const NodeCache = require('node-cache');
const Lookup = require('../../../../lib/lookup');
const Config = require('../../../../lib/config');
const sandbox = require('sinon').createSandbox();
const expect = require('chai').expect;

describe('/routes/lookup/lookup', function() {
    describe('finish', function() {
        beforeEach(async function() {
            const stubRedisDisconnect = sandbox.stub(Redis.prototype, 'disconnect');
            stubRedisDisconnect.callsFake(async function () {
                // This will trigger connect event.
                this.setStatus('disconnect');
            });
            const lookup = require('../../../../routes/lookup/lookup');
            await lookup.finish();
        });
        it('no init', async function() {
            const lookup = require('../../../../routes/lookup/lookup');
            await lookup.finish();
        });
    });
    describe('cacheLocally', function() {
        beforeEach(function() {
            const stubRedisConnect = sandbox.stub(Redis.prototype, 'connect');
            stubRedisConnect.callsFake(async function () {
                // This will trigger connect event.
                this.setStatus('connect');
            });
        });
        afterEach(function() {
            sandbox.restore();
        });
        it('valid', function(done) {
            sandbox.stub(NodeCache.prototype, 'set').returns();
            const lookup = require('../../../../routes/lookup/lookup');
            let config = new Config({});
            config.configured = true;
            config.aclDatabaseFile = ':memory:';
            lookup.init({config: config}).then(() => {
                lookup.cacheLocally('1.2.3.4', false);
                done();
            });
        });
        it('full', function(done) {
            sandbox.stub(NodeCache.prototype, 'set').throws(new Error('err'));
            const lookup = require('../../../../routes/lookup/lookup');
            let config = new Config({});
            config.configured = true;
            config.aclDatabaseFile = ':memory:';
            lookup.init({config: config}).then(() => {
                lookup.cacheLocally('1.2.3.4', false);
                done();
            });
        });
    });
    describe('recursiveCnameLookup', function() {
        beforeEach(function() {
            const stubRedisConnect = sandbox.stub(Redis.prototype, 'connect');
            stubRedisConnect.callsFake(async function () {
                // This will trigger connect event.
                this.setStatus('connect');
            });
        });
        afterEach(function() {
            sandbox.restore();
        });
        it('valid cname', function(done) {
            sandbox.stub(Redis.prototype, 'get').callsFake(function(ip) {
                if (ip === '1.2.3.4') {
                    return Promise.resolve('domain1.com');
                } else if (ip === 'domain1.com') {
                    return Promise.resolve('domain2.com');
                } else {
                    return Promise.resolve(null);
                }
            });
            const lookup = require('../../../../routes/lookup/lookup');
            let config = new Config({});
            config.configured = true;
            config.aclDatabaseFile = ':memory:';
            lookup.init({config: config}).then(() => {
                lookup.recursiveCnameLookup('1.2.3.4').then(hostname => {
                    expect(hostname).eql('domain2.com');
                    done();
                });
            });
        });
        it('error', function(done) {
            sandbox.stub(Redis.prototype, 'get').rejects();
            const lookup = require('../../../../routes/lookup/lookup');
            let config = new Config({});
            config.configured = true;
            config.aclDatabaseFile = ':memory:';
            let error = null;
            lookup.init({config: config}).then(() => {
                lookup.recursiveCnameLookup('1.2.3.4').then(result => {
                    expect(result.match).false;
                    done();
                });
            });
        });
    });
    describe('lookupByHostname', function() {
        beforeEach(function() {
            const stubRedisConnect = sandbox.stub(Redis.prototype, 'connect');
            stubRedisConnect.callsFake(async function () {
                // This will trigger connect event.
                this.setStatus('connect');
            });
        });
        afterEach(function() {
            sandbox.restore();
        });
        it('valid', async function() {
            sandbox.stub(Lookup.prototype, 'lookupHostName').resolves({
                domainText: 'google.com',
                categoryText: 'searchengines'
            });
            const request = httpMocks.createRequest({
                method: 'POST',
                url: '/lookuphost',
                headers: {
                    accept: 'application/json'
                },
                body: {
                    hostname: 'google.com',
                    category: 'searchengines'
                }
            });
            const response = httpMocks.createResponse();

            const lookup = require('../../../../routes/lookup/lookup');
            let config = new Config({});
            config.configured = true;
            config.aclDatabaseFile = ':memory:';
            await lookup.init({config: config});

            await lookup.lookupHostName(request, response);
            const result = response._getData();
            expect(result.match).true;

            // Get the cached value
            const request2 = httpMocks.createRequest({
                method: 'POST',
                url: '/lookuphost',
                headers: {
                    accept: 'application/json'
                },
                body: {
                    hostname: 'google.com',
                    category: 'searchengines'
                }
            });
            const response2 = httpMocks.createResponse();
            await lookup.lookupHostName(request2, response2);
            const result2 = response2._getData();
            expect(result2.match).true
        });

        it('no match', async function() {
            sandbox.stub(Lookup.prototype, 'lookupHostName').resolves(null);
            const request = httpMocks.createRequest({
                method: 'POST',
                url: '/lookuphost',
                headers: {
                    accept: 'application/json'
                },
                body: {
                    hostname: 'imdb.com',
                    category: 'searchengines'
                }
            });
            const response = httpMocks.createResponse();

            const lookup = require('../../../../routes/lookup/lookup');
            let config = new Config({});
            config.configured = true;
            config.aclDatabaseFile = ':memory:';
            try {
                await lookup.init({config: config});
            } catch(err) {
                console.log(err);
            }

            await lookup.lookupHostName(request, response);
            const result = response._getData();
            expect(result.match).false;

            // Get the cached value
            const request2 = httpMocks.createRequest({
                method: 'POST',
                url: '/lookuphost',
                headers: {
                    accept: 'application/json'
                },
                body: {
                    hostname: 'imdb.com',
                    category: 'searchengines'
                }
            });
            const response2 = httpMocks.createResponse();
            await lookup.lookupHostName(request2, response2);
            const result2 = response2._getData();
            expect(result2.match).false
        });

        it('500', async function() {
            sandbox.stub(Lookup.prototype, 'lookupHostName').resolves({
                domainText: 'google.com',
                categoryText: 'searchengines'
            });
            const request = httpMocks.createRequest({
                method: 'POST',
                url: '/lookuphost',
                headers: {
                    accept: 'application/json'
                },
                body: {
                    category: 'searchengines'
                }
            });
            const response = httpMocks.createResponse();

            const lookup = require('../../../../routes/lookup/lookup');
            let config = new Config({});
            config.configured = true;
            config.aclDatabaseFile = ':memory:';
            await lookup.init({config: config});

            await lookup.lookupHostName(request, response);
            expect(response.statusCode).eql(500);
        });
    });

    describe('lookupByIP', function() {
        beforeEach(function() {
            const stubRedisConnect = sandbox.stub(Redis.prototype, 'connect');
            stubRedisConnect.callsFake(async function () {
                // This will trigger connect event.
                this.setStatus('connect');
            });
            const stubRedisDisonnect = sandbox.stub(Redis.prototype, 'disconnect');
            stubRedisConnect.callsFake(async function () {
                // This will trigger connect event.
                this.setStatus('disconnect');
            });
        });
        afterEach(function() {
            sandbox.restore();
        });
        it('valid', function(done) {
            sandbox.stub(Lookup.prototype, 'lookupHostName').resolves({
                domainText: 'google.com',
                categoryText: 'searchengines'
            });
            sandbox.stub(Redis.prototype, 'get').callsFake(function(ip) {
                if (ip === '1.2.3.4') {
                    return Promise.resolve('google.com')
                } else {
                    return Promise.resolve(null);
                }
            });
            const request = httpMocks.createRequest({
                method: 'POST',
                url: '/lookupip',
                headers: {
                    accept: 'application/json'
                },
                body: {
                    ip: '1.2.3.4',
                    category: 'searchengines'
                }
            });
            const response = httpMocks.createResponse({
                eventEmitter: eventEmitter
            });

            const lookup = require('../../../../routes/lookup/lookup');
            let config = new Config({});
            config.configured = true;
            config.aclDatabaseFile = ':memory:';
            lookup.init({redisPass: 'abc123', config: config}).then(() => {
                lookup.lookupByIp(request, response);
            });

            response.on('end', function() {
                expect(response.statusCode).to.equal(200);
                const result = response._getData();
                expect(result.match).true;
                done();
            });
        });

        it('500', function(done) {
            const request = httpMocks.createRequest({
                method: 'POST',
                url: '/lookupip',
                headers: {
                    accept: 'application/json'
                },
                body: {
                    category: 'searchengines'
                }
            });
            const response = httpMocks.createResponse({
                eventEmitter: eventEmitter
            });

            const lookup = require('../../../../routes/lookup/lookup');
            let config = new Config({});
            config.configured = true;
            config.aclDatabaseFile = ':memory:';
            lookup.init({redisPass: 'abc123', config: config}).then(() => {
                lookup.lookupByIp(request, response);
            });

            response.on('end', function() {
                expect(response.statusCode).to.equal(500);
                done();
            });
        });

        it('503', function(done) {
            const request = httpMocks.createRequest({
                method: 'POST',
                url: '/lookupip',
                headers: {
                    accept: 'application/json'
                },
                body: {
                    ip: '1.2.3.4',
                    category: 'searchengines'
                }
            });
            const response = httpMocks.createResponse({
                eventEmitter: eventEmitter
            });

            const lookup = require('../../../../routes/lookup/lookup');
            let config = new Config({});
            config.aclDatabaseFile = ':memory:';
            lookup.finish().then(() => {
                lookup.init({redisPass: 'abc123', config: config}).then(() => {
                    lookup.lookupByIp(request, response);
                });
            });

            response.on('end', function() {
                expect(response.statusCode).to.equal(503);
                done();
            });
        });

        it('ip miss', function(done) {
            sandbox.stub(Lookup.prototype, 'lookupHostName').resolves({
                domainText: 'google.com',
                categoryText: 'searchengines'
            });
            sandbox.stub(Redis.prototype, 'get').resolves(null);
            const request = httpMocks.createRequest({
                method: 'POST',
                url: '/lookupip',
                headers: {
                    accept: 'application/json'
                },
                body: {
                    ip: '1.2.3.4',
                    category: 'ip_miss'
                }
            });
            const response = httpMocks.createResponse({
                eventEmitter: eventEmitter
            });

            const lookup = require('../../../../routes/lookup/lookup');
            let config = new Config({});
            config.configured = true;
            config.aclDatabaseFile = ':memory:';
            lookup.init({redisPass: 'abc123', config: config}).then(() => {
                lookup.lookupByIp(request, response);
            });

            response.on('end', function() {
                expect(response.statusCode).to.equal(200);
                const result = response._getData();
                expect(result.match).true;
                done();
            });
        });

        it('ip miss with category', function(done) {
            sandbox.stub(Lookup.prototype, 'lookupHostName').resolves({
                domainText: 'google.com',
                categoryText: 'searchengines'
            });
            sandbox.stub(Redis.prototype, 'get').resolves(null);
            const request = httpMocks.createRequest({
                method: 'POST',
                url: '/lookupip',
                headers: {
                    accept: 'application/json'
                },
                body: {
                    ip: '1.2.3.4',
                    category: 'searchengines'
                }
            });
            const response = httpMocks.createResponse({
                eventEmitter: eventEmitter
            });

            const lookup = require('../../../../routes/lookup/lookup');
            let config = new Config({});
            config.configured = true;
            config.aclDatabaseFile = ':memory:';
            lookup.init({redisPass: 'abc123', config: config}).then(() => {
                lookup.lookupByIp(request, response);
            });

            response.on('end', function() {
                expect(response.statusCode).to.equal(200);
                const result = response._getData();
                expect(result.match).false;
                done();
            });
        });

        it('cached', function(done) {
            sandbox.stub(NodeCache.prototype, 'get').returns({ip: '1.2.3.4', category: 'searchengines'});
            const request = httpMocks.createRequest({
                method: 'POST',
                url: '/lookupip',
                headers: {
                    accept: 'application/json'
                },
                body: {
                    ip: '1.2.3.4',
                    category: 'searchengines'
                }
            });
            const response = httpMocks.createResponse({
                eventEmitter: eventEmitter
            });

            const lookup = require('../../../../routes/lookup/lookup');
            let config = new Config({});
            config.configured = true;
            config.aclDatabaseFile = ':memory:';
            lookup.init({redisPass: 'abc123', config: config}).then(() => {
                lookup.lookupByIp(request, response);
            });

            response.on('end', function() {
                expect(response.statusCode).to.equal(200);
                const result = response._getData();
                expect(result.match).true;
                done();
            });
        });

        it('no match', function(done) {
            sandbox.stub(Lookup.prototype, 'lookupHostName').resolves(null);
            sandbox.stub(Redis.prototype, 'get').callsFake(function(ip) {
                if (ip === '1.2.3.4') {
                    return Promise.resolve('google.com')
                } else {
                    return Promise.resolve(null);
                }
            });
            const request = httpMocks.createRequest({
                method: 'POST',
                url: '/lookuphost',
                headers: {
                    accept: 'application/json'
                },
                body: {
                    ip: '1.2.3.4',
                    category: 'searchengines'
                }
            });
            const response = httpMocks.createResponse({
                eventEmitter: eventEmitter
            });

            const lookup = require('../../../../routes/lookup/lookup');
            let config = new Config({});
            config.configured = true;
            config.aclDatabaseFile = ':memory:';
            lookup.init({config: config}).then(() => {
                lookup.lookupByIp(request, response);
            });

            response.on('end', function() {
                const result = response._getData();
                expect(result.match).false;
                done();
            });
        });

        it('no match - cached', function(done) {
            sandbox.stub(NodeCache.prototype, 'get').returns(false);
            const request = httpMocks.createRequest({
                method: 'POST',
                url: '/lookupip',
                headers: {
                    accept: 'application/json'
                },
                body: {
                    ip: '1.2.3.4',
                    category: 'searchengines'
                }
            });
            const response = httpMocks.createResponse({
                eventEmitter: eventEmitter
            });

            const lookup = require('../../../../routes/lookup/lookup');
            let config = new Config({});
            config.configured = true;
            config.aclDatabaseFile = ':memory:';
            lookup.init({redisPass: 'abc123', config: config}).then(() => {
                lookup.lookupByIp(request, response);
            });

            response.on('end', function() {
                expect(response.statusCode).to.equal(200);
                const result = response._getData();
                expect(result.match).false;
                done();
            });
        });
    });
});