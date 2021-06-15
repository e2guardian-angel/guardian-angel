'use strict';
const ejs = require('ejs');
const fs = require('fs');
const User = require('../../lib/auth/user');

function passReset(req, res) {
    // TODO: handle password reset error
    res.status(200).send(ejs.render(fs.readFileSync(`${__dirname}/views/passreset.html`, 'utf-8'), {username: req.user.username}));
}

async function doPassReset(req, res) {
    const newPassword = req.body.password;
    const confirm = req.body.confirm;
    const username = req.body.username;

    if (!newPassword || !confirm || !username) {
        return res.redirect('/passreset?error=true&errorCode=1');
    } else if (newPassword !== confirm) {
        return res.redirect('/passreset?error=true&errorCode=2');
    }
    try {
        const user = await User.findOne({username: username});
        user.forceReset = false;
        await user.setPassword(newPassword);
        user.save();
        return res.status(200).redirect('/');
    } catch (err) {
        return res.redirect('/passreset?error=true&errorCode=3');
    }
}

module.exports = {passReset, doPassReset};