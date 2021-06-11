'use strict'
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const router = require('../routes');
const lookup = require('../routes/lookup/lookup');
const Controller = require('../lib/controller');
const mongoose = require('mongoose');
const User = require('./auth/user');

const secretKey = process.env.SESSION_SECRET;

let app = express();
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded());
app.use(helmet());
app.use(session({
    secret: secretKey,
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(router);

passport.use(User.createStrategy());
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

const controller = new Controller();
let appServer;

function startup() {
    return new Promise(function(resolve) {
        controller.getKubeData().then(async kubeData => {
            // Connect to auth database
            let authStr = '';
            if (process.env.MONGO_INITDB_ROOT_USERNAME && process.env.MONGO_INITDB_ROOT_PASSWORD) {
                authStr = `${process.env.MONGO_INITDB_ROOT_USERNAME}:${process.env.MONGO_INITDB_ROOT_PASSWORD}@`;
            }
            await mongoose.connect(`mongodb://${authStr}${kubeData.config.authDb.host}/my_database`, {
                useNewUrlParser: true,
                useUnifiedTopology: true,
                useFindAndModify: false,
                useCreateIndex: true
            });

            const adminUser = await User.findOne({username: 'admin'});
            if (!adminUser) {
                // Create admin user with default password
                let created = new User();
                created.username = 'admin';
                created.groups = 'admin';
                created.forceReset = true;
                await created.setPassword('admin123');
                await created.save();
            }
            await lookup.init(kubeData);
            if (!kubeData.nginx) {
                // Ingress is not started; start it as we will need it to configure guardian-angel
                await controller.pushConfig();
                await controller.deployNginx();
            }
            appServer = app.listen(kubeData.config.httpPort, function() {
                console.info(`Server is listening on port ${kubeData.config.httpPort}`);
                resolve();
            });
        }).catch(err => {
            console.error(`Failed to start: ${err.message}`);
            resolve();
        });
    });
}

function gracefulShutdown() {
    console.info('Shutting down...');
    if (appServer) {
        appServer.close(async () => {
            await mongoose.disconnect();
            await lookup.finish();
            console.info('guardian-angel exited.');
            appServer = null;
            process.exit(0);
        });
    }
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('SIGHUP', gracefulShutdown);

module.exports.startup = startup;
module.exports.gracefulShutdown = gracefulShutdown;
