'use strict'
const express = require('express');
const bodyParser = require('body-parser')
const router = require('./routes');
const lookup = require('./routes/lookup/lookup');
const Config = require('./lib/config');
const nconf = require('nconf');
const fs = require('fs');

nconf.env();
const configFile = nconf.get('GUARDIAN_ANGEL_CONF_FILE') || '/opt/guardian/guardian.yaml';
const data = JSON.parse(fs.readFileSync(configFile));
const config = new Config(data);
lookup.init(config);

let app = express();
app.use(bodyParser.json());
app.use(router);

app.listen(config.httpPort, function(err) {
    if (err) {
        console.error(err);
    }
    console.info(`Server is listening on port ${config.httpPort}`);
})