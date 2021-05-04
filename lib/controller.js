'use strict'

var Controller = defclass({
    constructor: function (config) {
        this.config = config;
    }
});

function defclass(prototype) {
    var constructor = prototype.constructor;
    constructor.prototype = prototype;
    return constructor;
}

module.exports = Controller;