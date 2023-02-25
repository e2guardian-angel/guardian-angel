'use strict';

const lookup = require('../lookup/lookup');

async function listState(req, res, next) {
    const currentState = await lookup.getState();
    if (currentState.loading) {
        return res.status(400).send('Currently loading lists, please try again later.');
    } else if (currentState.generating) {
        return res.status(400).send('Currently generating lists, please try again later.');
    } else {
        return next();
    }
}

module.exports = listState;