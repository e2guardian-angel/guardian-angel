'use strict'
const template = require('swig');
const path = require('path');

var Controller = defclass({
    constructor: function (config) {
        this.config = config;
    },
    generateSquidConfig: function() {
        let squidTmpl = template.compileFile('./templates/squid.conf');
        let properties = {
            localNetwork: this.config.localNetwork
        };
        if (this.config.sslBumpEnabled) {
            const crtFile = path.join(this.config.squidConfigDir, 'ssl', 'public.crt');
            const keyFile = path.join(this.config.squidConfigDir, 'ssl', 'private.key');
            properties.httpPortLine =
                `http_port ${this.config.proxy} ssl-bump generate-host-certificates=on dynamic_cert_mem_cache_size=4MB cert=${crtFile} key=${keyFile}`;
            // TODO: generate ssl-bump cert/key pair if it doesn't exist
        } else {
            properties.httpPortLine = 'http_port 3128';
        }
        const squidOutput = squidTmpl.render(properties);
    }
});

function defclass(prototype) {
    var constructor = prototype.constructor;
    constructor.prototype = prototype;
    return constructor;
}

module.exports = Controller;