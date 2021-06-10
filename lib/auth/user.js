'use strict';

const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const passportLocalMongoose = require('passport-local-mongoose');

const User = new Schema({
    username: String,
    groups: String,
    forceReset: Boolean
});

User.plugin(passportLocalMongoose);

module.exports = mongoose.model("User", User);