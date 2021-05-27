'use strict';

const Controller = require('../../../lib/controller');
const controller = new Controller();
const expect = require('chai').expect;
const fs = require('fs');

describe('/lib/controller', function() {
    describe('updateGuardianConf', function() {
        it('valid', async function() {
            try {
                await controller.getConfig();
                const currentConfig = JSON.parse(fs.readFileSync('/opt/guardian/guardian.json'));
                await controller.updateGuardianConf(currentConfig);
                const newConfig = await controller.getConfig()
                expect(JSON.stringify(currentConfig)).eql(JSON.stringify(newConfig));
            } catch (err) {
                self.fail(err);
            }
        });
    });
});