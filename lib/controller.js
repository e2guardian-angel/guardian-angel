'use strict'
const fs = require('fs');
const path = require('path');
const got = require('got');
const crypto = require('crypto');
const nconf = require('nconf');
const Config = require('./config');

// *** Constants ***
const KUBE_INTERNAL_URL = 'https://kubernetes.default.svc.cluster.local';
// Local files
const SERVICE_ACCOUNT_TOKEN_FILE = '/var/run/secrets/kubernetes.io/serviceaccount/token';
const SERVICE_ACCOUNT_CA_FILE = '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt';
const GUARDIAN_CERT_FILE = '/opt/guardian/ssl/cert.pem'
const GUARDIAN_KEY_FILE = '/opt/guardian/ssl/key.pem'
const GUARDIAN_CONFIG_FILE = nconf.get('GUARDIAN_ANGEL_CONF_FILE') || '/opt/guardian/guardian.json';
const GUARDIAN_CONFIG_RESOURCE_FILE = `${__dirname}/json/guardian-conf-configmap.json`;
const REDIS_PASS_RESOURCE_FILE = `${__dirname}/json/redis-pass-secret.json`
const GUARDIAN_CERT_RESOURCE_FILE = `${__dirname}/json/guardian-cert-configmap.json`;
// Kubernetes API paths
// TODO: Make namespace configurable
const CONFIGMAPS_PATH = 'api/v1/namespaces/default/configmaps';
const SECRETS_PATH = '/api/v1/namespaces/default/secrets';
// Kubernetes resource paths
const GUARDIAN_CONF_PATH = `${CONFIGMAPS_PATH}/guardian-conf`;
const GUARDIAN_CERT_PATH = `${CONFIGMAPS_PATH}/guardian-cert`;
const REDIS_PASS_PATH = `${SECRETS_PATH}/api/v1/namespaces/default/secrets`

// Global config
let config;

function readFileContents(path) {
    if (fs.existsSync(path)) {
        return fs.readFileSync(path, 'utf8');
    } else {
        return '';
    }
}

var Controller = defclass({

    baseUrl: '',
    configMapExists: false,
    serviceAccountToken: '',
    serviceAccountCA: '',

    constructor: function () {
        nconf.env('__');
        this.baseUrl =  nconf.get('KUBERNETES_BASE_URL') || KUBE_INTERNAL_URL;
        this.serviceAccountToken = readFileContents(SERVICE_ACCOUNT_TOKEN_FILE);
        this.serviceAccountCA = readFileContents(SERVICE_ACCOUNT_CA_FILE);
    },
    getDefaultOptions: function() {
        let options = {
            responseType: 'json',
            headers: {
                'Accept': 'application/json',
            }
        }
        if (this.serviceAccountToken) {
            options.headers.Authorization = `Bearer ${this.serviceAccountToken}`;
        }
        if (this.serviceAccountCA) {
            options.https = {};
            options.https.certificateAuthority = this.serviceAccountCA
        }
        return options;
    },
    kubePost: async function(path, data) {
        const url = `${this.baseUrl}/${path}`;
        let options = this.getDefaultOptions();
        options.json = data;
        // Perform Request
        try {
            const result = await got.post(url, options);
            if ([200,201,202].indexOf(result.statusCode) < 0) {
                let message = `Failed to create, bad status code: ${result.statusCode} : \n${result.body}`;
                throw new Error(message);
            }
            return result;
        } catch (err) {
            throw err;
        }
    },
    kubePut: async function(path, data) {
        const url = `${this.baseUrl}/${path}`;
        let options = this.getDefaultOptions();
        options.json = data;
        try {
            const result = await got.put(url, options);
            if ([200,201,202].indexOf(result.statusCode) < 0) {
                let message = `Failed to create, bad status code: ${result.statusCode} : \n${result.body}`;
                throw new Error(message);
            }
            return result;
        } catch (err) {
            throw err;
        }
    },
    kubePatch: async function(path, data) {
        const url = `${this.baseUrl}/${path}`;
        let options = this.getDefaultOptions();
        options.json = data;
        try {
            const result = await got.patch(url, options);
            if ([200,201,202].indexOf(result.statusCode) < 0) {
                let message = `Failed to create, bad status code: ${result.statusCode} : \n${result.body}`;
                throw new Error(message);
            }
            return result;
        } catch (err) {
            throw err;
        }
    },
    kubeGet: async function(path) {
        const url = `${this.baseUrl}/${path}`;
        let options = this.getDefaultOptions();
        try {
            const result = await got.get(url, options);
            if ([200,201,202].indexOf(result.statusCode) < 0) {
                let message = `Failed to create, bad status code: ${result.statusCode} : \n${result.body}`;
                throw new Error(message);
            }
            return result;
        } catch (err) {
            throw err;
        }
    },
    kubeDelete: async function(path) {
        const url = `${this.baseUrl}/${path}`;
        let options = this.getDefaultOptions();
        try {
            const result = await got.delete(url, options);
            if ([200,201,202].indexOf(result.statusCode) < 0) {
                let message = `Failed to create, bad status code: ${result.statusCode} : \n${result.body}`;
                throw new Error(message);
            }
            return result;
        } catch (err) {
            throw err;
        }
    },
    getGuardianConf: async function() {
        try {
            const response = await this.kubeGet(GUARDIAN_CONF_PATH);
            let data = JSON.parse(response.body.data['guardian.json']);
            return data
        } catch (err) {
            console.error(`Failed to retrieve guardian config: \n${err.message}`);
            return null;
        }
    },
    updateGuardianConf: async function(config) {
        try {
            let resource = JSON.parse(fs.readFileSync(GUARDIAN_CONFIG_RESOURCE_FILE));
            resource.data[path.basename(GUARDIAN_CONFIG_FILE)] = JSON.stringify(config);
            let response;
            if (this.configMapExists) {
                response = await this.kubePut(GUARDIAN_CONF_PATH, resource);
            } else {
                response = await this.kubePost(CONFIGMAPS_PATH, resource);
            }
            this.configMapExists = true;
            return response.statusCode;
        } catch (err) {
            console.error(`Failed to update guardian config: \n${err.message}`);
            return null;
        }
    },
    getConfig: async function() {
        if(!config) {
            try {
                config = await this.getGuardianConf();
                if(!config) {
                    let data = JSON.parse(fs.readFileSync(GUARDIAN_CONFIG_FILE));
                    config = new Config(data);
                } else {
                    this.configMapExists = true;
                }
            } catch (err) {
                config = new Config({});
            }
        }
        return config;
    },
    setRedisSecret: async function() {
        try {
            let redisPass = process.env.REDIS_PASS || crypto.randomBytes(20).toString('hex');
            let passBuffer = new Buffer.from(redisPass);
            let secretResource = JSON.parse(fs.readFileSync(REDIS_PASS_RESOURCE_FILE));
            secretResource.data.REDIS_PASS = passBuffer.toString('base64');
            let response;
            if (process.env.REDIS_PASS) {
                // Redis password has already been set; we are updating it
                response = await this.kubePut(REDIS_PASS_PATH, secretResource);
            } else {
                // This is a new secret we are creating
                response = await this.kubePost(SECRETS_PATH, secretResource);
                // Set the secret in the environment variable so that we can use it
                process.env.REDIS_PASS = redisPass;
            }
            return response.statusCode;
        } catch (err) {
            console.error(`Failed to create redis secret: ${err.message}`);
            return null;
        }
    },
    getRedisSecret: async function() {
        if(process.env.REDIS_SECRET) {
            return process.env.REDIS_SECRET;
        } else {
            // Do a GET request on the resource
            try {
                const secretResource = JSON.parse(await this.kubeGet(REDIS_PASS_PATH));
                let passBuffer = Buffer.from(secretResource.data.REDIS_PASS, 'base64');
                let redisPass = passBuffer.toString('utf-8');
                // Set this in the environment so that we can use it
                process.env.REDIS_PASS = redisPass;
                return redisPass;
            } catch (err) {
                console.info('No redis password stored in secret or env var');
                return null;
            }
        }
    },
    getGuardianCertificate() {
        if (fs.existsSync(GUARDIAN_CERT_FILE)) {
            return fs.readFileSync(GUARDIAN_CERT_FILE);
        } else {
            try {
                let result = this.kubeGet(GUARDIAN_CERT_PATH);
                fs.mkdirSync(path.dirname(GUARDIAN_CERT_FILE), { recursive: true });
                fs.writeFileSync(GUARDIAN_CERT_FILE, result.data['public.crt'], {mode: 644, flags: 'w'});
                return result.data['public.crt'];
            } catch (err) {
                console.info('No certificate locally or in ConfigMap');
                return null;
            }
        }
    }
});

function defclass(prototype) {
    var constructor = prototype.constructor;
    constructor.prototype = prototype;
    return constructor;
}

module.exports = Controller;