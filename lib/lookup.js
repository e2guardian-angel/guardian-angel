'use strict'

var Tree = defclass({
    constructor: function (parent) {
        this.parent   = parent || null; // null for root node
        this.children = {};             // for id based lookup
        this.ids      = [];             // for index based lookup
        this.length   = 0;              // for ease of access
        this.category = null;
    },
    addNode: function (id) {
        var children = this.children;
        if (children.hasOwnProperty(id)) throw new Error(id + " exists");
        return children[this.ids[this.length++] = id] = new Tree(this);
    },
    getChildById: function (id) {
        var children = this.children;
        if (children.hasOwnProperty(id)) return children[id];
        throw new Error(id + " does not exist");
    },
    getAtIndex: function (index) {
        return this.getChildById(this.ids[index]);
    },
    addHostName: function(hostname, category) {
        let parts = hostname.split('.').reverse();
        if (parts.length === 0) {
            throw Error(`Invalid hostname: ${hostname}`);
        }
        let currentNode = this;
        let currentId = parts[0];
        while (parts.length > 0) {
            parts = parts.slice(1);
            try {
                currentNode = currentNode.getChildById(currentId);
            } catch (err) {
                currentNode = currentNode.addNode(currentId);
            }
            if (parts.length > 0) {
                currentId = `${currentId}.${parts[0]}`;
            } else {
                currentNode.category = category;
            }
        }
    }
});

function defclass(prototype) {
    var constructor = prototype.constructor;
    constructor.prototype = prototype;
    return constructor;
}

module.exports = Tree;