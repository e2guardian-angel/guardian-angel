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
const REDIS_PASS_PATH = `${SECRETS_PATH}/redis-pass`

// Global config
let config;

// Local store of all configmaps/secrets
let kubeData = {};

function readFileContents(path) {
    if (fs.existsSync(path)) {
        return fs.readFileSync(path, 'utf8');
    } else {
        return '';
    }
}

var Controller = defclass({

    baseUrl: '',
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
    kubeApply: async function(kubePath, resourcePath, resource) {
        // Get resource; if it exists, then PUT, else POST
        let fetched;
        await this.kubeGet(resourcePath).then(resource => {
            fetched = resource;
        }).catch(err => {
            fetched = null;
        });
        try {
            if (fetched) {
                return (await this.kubePut(resourcePath, resource)).statusCode;
            } else {
                return (await this.kubePost(kubePath, resource)).statusCode;
            }
        } catch (err) {
            console.error(`Failed to apply kubeconfig: \n${err.message}`);
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
            kubeData.config = config;
            resource.data[path.basename(GUARDIAN_CONFIG_FILE)] = JSON.stringify(kubeData.config);
            return await this.kubeApply(CONFIGMAPS_PATH, GUARDIAN_CONF_PATH, resource);
        } catch (err) {
            console.error(`Failed to update guardian config: \n${err.message}`);
            return null;
        }
    },
    getConfig: async function() {
        if(!config) {
            try {
                config = await this.getGuardianConf();
            } catch (err) {
                config = new Config({});
            }
        }
        return config;
    },
    setRedisSecret: async function(redisPass) {
        try {
            let storePassword = joi.attempt(redisPass, joi.string().min(40).regex(/^[0-9a-f]+$/));
            let passBuffer = new Buffer.from(storePassword);
            let secretResource = JSON.parse(fs.readFileSync(REDIS_PASS_RESOURCE_FILE));
            secretResource.data.REDIS_PASS = passBuffer.toString('base64');
            kubeData.redisPass = storePassword;
            return await this.kubeApply(SECRETS_PATH, REDIS_PASS_PATH, secretResource);
        } catch (err) {
            console.error(`Failed to create redis secret: ${err.message}`);
            return null;
        }
    },
    getRedisSecret: async function() {
        if(kubeData.redisPass) {
            return kubeData.redisPass;
        } else {
            // Do a GET request on the resource
            try {
                const secretResource = JSON.parse(await this.kubeGet(REDIS_PASS_PATH));
                let passBuffer = Buffer.from(secretResource.data.REDIS_PASS, 'base64');
                kubeData.redisPass = passBuffer.toString('utf-8')
                return kubeData.redisPass;
            } catch (err) {
                console.info('No redis password stored in secret or env var');
                return null;
            }
        }
    },
    setGuardianCertificate() {

    },
    getGuardianCertificate: async function() {
        if (kubeData.cert) {
            return kubeData.cert;
        } else {
            try {
                let result = await this.kubeGet(GUARDIAN_CERT_PATH);
                kubeData.cert = result.data['public.crt'];
                return result.data['public.crt'];
            } catch (err) {
                console.info('No certificate locally or in ConfigMap');
                return null;
            }
        }
    },
    writeCertFile() {
        if (kubeData.cert) {
            fs.mkdirSync(path.dirname(GUARDIAN_CERT_FILE), { recursive: true });
            fs.writeFileSync(GUARDIAN_CERT_FILE, kubeData.cert, {mode: 644, flags: 'w'});
        }
    },
    getKubeData: async function() {
        try {
            kubeData.config = await this.getConfig();
            kubeData.redisPass = await this.getRedisSecret();
            kubeData.cert = await this.getGuardianCertificate();
            return kubeData;
        } catch (err) {
            console.error(err.message);
            return null;
        }

        // TODO: get certificate and key

    },
});

function defclass(prototype) {
    var constructor = prototype.constructor;
    constructor.prototype = prototype;
    return constructor;
}

module.exports = Controller;