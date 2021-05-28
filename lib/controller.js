'use strict'
const fs = require('fs');
const path = require('path');
const got = require('got');
const crypto = require('crypto');
const joi = require('joi');
const nconf = require('nconf');
const selfsigned = require('selfsigned');
const Config = require('./config');

// *** Constants ***
const KUBE_INTERNAL_URL = 'https://kubernetes.default.svc.cluster.local';
// Local files
const SERVICE_ACCOUNT_TOKEN_FILE = '/var/run/secrets/kubernetes.io/serviceaccount/token';
const SERVICE_ACCOUNT_CA_FILE = '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt';
const GUARDIAN_CONFIG_FILE = nconf.get('GUARDIAN_ANGEL_CONF_FILE') || '/opt/guardian/guardian.json';
// Resource files
const GUARDIAN_CONFIG_RESOURCE_FILE = `${__dirname}/json/guardian-conf-configmap.json`;
const REDIS_PASS_RESOURCE_FILE = `${__dirname}/json/redis-pass-secret.json`
const TLS_RESOURCE_FILE = `${__dirname}/json/tls-secret.json`;
const FILTER_DEPLOYMENT_RESOURCE_FILE = `${__dirname}/json/filter-deployment.json`;
// Kubernetes API paths
// TODO: Make namespace configurable
const CONFIGMAPS_KUBE_PATH = 'api/v1/namespaces/default/configmaps';
const SECRETS_KUBE_PATH = '/api/v1/namespaces/default/secrets';
// Kubernetes resource paths
const GUARDIAN_CONFIG_KUBE_PATH = `${CONFIGMAPS_KUBE_PATH}/guardian-conf`;
const GUARDIAN_TLS_KUBE_PATH = `${SECRETS_KUBE_PATH}/guardian-tls`
const REDIS_PASS_KUBE_PATH = `${SECRETS_KUBE_PATH}/redis-pass`;

// Local store of all configmaps/secrets
let kubeData = {};

// Local store of the different resources
let resources = { loaded: false };

function readFileContents(path) {
    if (fs.existsSync(path)) {
        return fs.readFileSync(path, 'utf8');
    } else {
        return '';
    }
}

function duplicateObject(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function loadResources() {
    resources.loaded = true;
    resources.deployments = {};
    resources.services = {};
    resources.configmaps = {};
    resources.secrets = {};

    // Load the deployments
    resources.deployments.filter = JSON.parse(fs.readFileSync(FILTER_DEPLOYMENT_RESOURCE_FILE));
    // Load the configmaps
    resources.configmaps.config = JSON.parse(fs.readFileSync(GUARDIAN_CONFIG_RESOURCE_FILE));
    // Load the secrets
    resources.secrets.tls = JSON.parse(fs.readFileSync(TLS_RESOURCE_FILE));
    resources.secrets.redisPass = JSON.parse(fs.readFileSync(REDIS_PASS_RESOURCE_FILE));
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
        if (!resources.loaded) {
            loadResources();
        }
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
    /*
     * Kubernetes operations
     */
    kubeOp: async function(op, path, options) {
        const url = `${this.baseUrl}/${path}`;
        try {
            const response = await op(url, options);
            if ([200,201,202].indexOf(response.statusCode) < 0) {
                let message = `Operation failed, bad status code: ${response.statusCode} : \n${response.body}`;
                let err = new Error(message);
                err.statusCode = response.statusCode;
                throw err;
            }
            return response;
        } catch (err) {
            throw err;
        }
    },
    kubePost: async function(path, data) {
        let options = this.getDefaultOptions();
        options.json = data;
        return this.kubeOp(got.post, path, options);
    },
    kubePut: async function(path, data) {
        let options = this.getDefaultOptions();
        options.json = data;
        return this.kubeOp(got.put, path, options);
    },
    kubePatch: async function(path, data) {
        let options = this.getDefaultOptions();
        options.json = data;
        return this.kubeOp(got.patch, path, options);
    },
    kubeGet: async function(path) {
        let options = this.getDefaultOptions();
        return this.kubeOp(got.get, path, options);
    },
    kubeDelete: async function(path) {
        let options = this.getDefaultOptions();
        return this.kubeOp(got.delete, path, options);
    },
    /*
     * kubeApply is the equivalent of "kubectl apply -f" - it checks if the resource exists,
     * and performs either a POST or PUT, respectively
     */
    kubeApply: async function(kubePath, resourcePath, resource) {
        // Get resource; if it exists, then PUT, else POST
        let fetched;
        await this.kubeGet(resourcePath).then(resource => {
            fetched = resource;
        }).catch(function() {
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
    /*
     * Guardian config operations
     */
    setConfig: function(config) {
        kubeData.config = new Config(config);
    },
    getConfig: function() {
        return kubeData.config || new Config({});
    },
    pushConfig: async function() {
        try {
            let configResource = duplicateObject(resources.configmaps.config);
            configResource.data[path.basename(GUARDIAN_CONFIG_FILE)] = JSON.stringify(kubeData.config);
            return await this.kubeApply(CONFIGMAPS_KUBE_PATH, GUARDIAN_CONFIG_KUBE_PATH, configResource);
        } catch (err) {
            console.error(`Failed to push guardian config: \n${err.message}`);
            return null;
        }
    },
    pullConfig: async function() {
        try {
            let response = await this.kubeGet(GUARDIAN_CONFIG_KUBE_PATH);
            kubeData.config = JSON.parse(response.body.data[path.basename(GUARDIAN_CONFIG_FILE)]);
            return kubeData.config;
        } catch (err) {
            console.info('No config in ConfigMap');
            return null;
        }
    },
    writeConfigFile: async function() {
        fs.writeFileSync(GUARDIAN_CONFIG_FILE, JSON.stingify(kubeData.config), {flag: 'w'});
    },
    /*
     * Redis password operations
     */
    setRedisPassword: function(redisPass) {
        kubeData.redisPass = joi.attempt(redisPass, joi.string().min(40).regex(/^[0-9a-f]+$/));
    },
    getRedisPassword: function() {
        return kubeData.redisPass;
    },
    rotateRedisPassword: function() {
        const newPassword = crypto.randomBytes(20).toString('hex');
        this.setRedisPassword(newPassword);
    },
    pushRedisPassword: async function() {
        try {
            let passBuffer = new Buffer.from(kubeData.redisPass);
            let secretResource = duplicateObject(resources.secrets.redisPass);
            secretResource.data.REDIS_PASS = passBuffer.toString('base64');
            return await this.kubeApply(SECRETS_KUBE_PATH, REDIS_PASS_KUBE_PATH, secretResource);
        } catch (err) {
            console.error(`Failed to create redis secret: ${err.message}`);
            return null;
        }
    },
    pullRedisPassword: async function() {
        try {
            const secretResource = JSON.parse(await this.kubeGet(REDIS_PASS_KUBE_PATH));
            let passBuffer = Buffer.from(secretResource.body.data.REDIS_PASS, 'base64');
            kubeData.redisPass = passBuffer.toString('utf-8')
            return kubeData.redisPass;
        } catch (err) {
            console.info('No redis password stored in secret or env var');
            return null;
        }
    },
    /*
     * TLS cert/key operations
     */
    setTLS(tlsData) {
        // TODO: how to validate certificate data?
        const schema = joi.object({
            cert: joi.string().min(1).required(),
            key: joi.string().min(1).required()
        });
        kubeData.tls = joi.attempt(tlsData, schema);
    },
    getTLS: function() {
        return kubeData.tls;
    },
    pullTLS: async function() {
        try {
            let tlsResource = await this.kubeGet(GUARDIAN_TLS_KUBE_PATH);
            kubeData.tls = {};
            kubeData.tls.cert = tlsResource.body.data['tls.crt'];
            // Don't store the key locally since we aren't using it
            return kubeData.tls;
        } catch (err) {
            console.info('No certificate locally or in ConfigMap');
            return null;
        }
    },
    pushTLS: async function() {
        if (!kubeData.tls.key) {
            // only push if the key is set locally
            return null;
        }
        try {
            let tlsResource = duplicateObject(resources.secrets.tls);
            tlsResource.data['tls.crt'] = kubeData.tls.cert;
            tlsResource.data['tls.key'] = kubeData.tls.key;
            const result = await this.kubeApply(SECRETS_KUBE_PATH, GUARDIAN_TLS_KUBE_PATH, tlsResource);
            // erase local tls secret
            delete kubeData.tls.key;
            return result;
        } catch(err) {
            console.error(`Failed to push TLS data: ${err.message}`);
            return null;
        }
    },
    rotateTLS: async function() {
        const attrs = [
            {name: 'countryName', value: kubeData.config.caInfo.country},
            {name: 'stateOrProvinceName', value: kubeData.config.caInfo.state},
            {name: 'localityName', value: kubeData.config.caInfo.city},
            {name: 'organizationName', value: kubeData.config.caInfo.organization},
            {name: 'organizationalUnitName', value: kubeData.config.caInfo.organizationalUnit},
            {name: 'commonName', value: kubeData.config.caInfo.commonName},
            {name: 'emailAddress', value: kubeData.config.caInfo.email}
        ];
        const pem = selfsigned.generate(attrs, {days: kubeData.config.caInfo.days});
        this.setTLS({
            cert: pem.cert,
            key: pem.key
        });
    },
    /*
     * getKubeData is called upon initialization. It fetches all the kubernetes data needed
     * to run guardian, and stores it locally.
     */
    getKubeData: async function() {
        try {
            kubeData.config = await this.pullConfig() || new Config({});
            kubeData.redisPass = await this.pullRedisPassword();
            kubeData.tls = await this.pullTLS();
            return kubeData;
        } catch (err) {
            console.error(err.message);
            return null;
        }

        // TODO: get certificate and key

    }
});

function defclass(prototype) {
    var constructor = prototype.constructor;
    constructor.prototype = prototype;
    return constructor;
}

module.exports = Controller;