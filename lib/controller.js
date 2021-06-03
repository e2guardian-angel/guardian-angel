'use strict'
const fs = require('fs');
const path = require('path');
const got = require('got');
const crypto = require('crypto');
const joi = require('joi');
const nconf = require('nconf');
const selfSigned = require('selfsigned');
const { waitFor } = require('poll-until-promise');
const Config = require('./config');
const lookup = require('../routes/lookup/lookup');

// *** Constants ***
const KUBE_INTERNAL_URL = 'https://kubernetes.default.svc.cluster.local';
// Local files
const SERVICE_ACCOUNT_TOKEN_FILE = '/var/run/secrets/kubernetes.io/serviceaccount/token';
const SERVICE_ACCOUNT_CA_FILE = '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt';
const GUARDIAN_CONFIG_FILE = nconf.get('GUARDIAN_ANGEL_CONF_FILE') || '/opt/guardian/guardian.json';

// Local store of all configmaps/secrets
let kubeData = {};
let savedData = {
    deployments: {
        filter: {},
        redis: {},
        dns: {}
    },
    services: {
        filter: {},
        redis: {},
        dns: {}
    }
};

function readResourceFile(filename) {
    return JSON.parse(fs.readFileSync(filename));
}

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

var Controller = defclass({

    constructor: function () {
        nconf.env('__');
        this.namespace = nconf.get('NAMESPACE') || 'default';
        this.generatePaths(this.namespace);
        this.baseUrl =  nconf.get('KUBERNETES_BASE_URL') || KUBE_INTERNAL_URL;
        this.serviceAccountToken = readFileContents(SERVICE_ACCOUNT_TOKEN_FILE);
        this.serviceAccountCA = readFileContents(SERVICE_ACCOUNT_CA_FILE);
        this.resources = {
            loaded: false,
            deployments: {
                webfilter: readResourceFile(`${__dirname}/json/filter-deployment.json`),
                redis: readResourceFile(`${__dirname}/json/redis-deployment.json`),
                dns: readResourceFile(`${__dirname}/json/dns-deployment.json`)
            },
            services: {
                webfilter: readResourceFile(`${__dirname}/json/filter-service.json`),
                redis: readResourceFile(`${__dirname}/json/redis-service.json`),
                dns: readResourceFile(`${__dirname}/json/dns-service.json`)
            },
            configmaps: {
                config: readResourceFile(`${__dirname}/json/guardian-conf-configmap.json`)
            },
            secrets: {
                redisPass: readResourceFile(`${__dirname}/json/redis-pass-secret.json`),
                tls: readResourceFile(`${__dirname}/json/tls-secret.json`)
            }
        };
    },
    generatePaths: function(namespace) {
        this.paths = {};
        this.paths.kube = {};
        this.paths.resources = {};
        // Set kube paths
        this.paths.kube.configMaps = `api/v1/namespaces/${namespace}/configmaps`;
        this.paths.kube.secrets = `api/v1/namespaces/${namespace}/secrets`;
        this.paths.kube.deployments = `apis/apps/v1/namespaces/${namespace}/deployments`;
        this.paths.kube.services = `api/v1/namespaces/${namespace}/services`;
        this.paths.kube.pods = `api/v1/namespaces/${namespace}/pods`;
        // Set resource paths
        this.paths.resources.configs = {};
        this.paths.resources.configs.config = `${this.paths.kube.configMaps}/guardian-conf`;
        this.paths.resources.secrets = {};
        this.paths.resources.secrets.tls = `${this.paths.kube.secrets}/guardian-tls`;
        this.paths.resources.secrets.redisPass = `${this.paths.kube.secrets}/redis-pass`;
        this.paths.resources.deployments = {};
        this.paths.resources.deployments.redis = `${this.paths.kube.deployments}/redis`;
        this.paths.resources.deployments.webfilter = `${this.paths.kube.deployments}/webfilter`;
        this.paths.resources.deployments.dns = `${this.paths.kube.deployments}/dns`;
        this.paths.resources.services = {};
        this.paths.resources.services.redis = `${this.paths.kube.services}/redis`;
        this.paths.resources.services.webfilter = `${this.paths.kube.services}/webfilter`;
        this.paths.resources.services.dns = `${this.paths.kube.services}/dns`;
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

        return await op(url, options);
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
        }).catch(function(err) {
            fetched = null;
        });
        if (fetched) {
            return (await this.kubePut(resourcePath, resource)).statusCode;
        } else {
            return (await this.kubePost(kubePath, resource)).statusCode;
        }
    },
    /*
     * kubeApply for services, since we need clusterIP and resourceVersion
     */
    kubeApplyService: async function(kubePath, resourcePath, resource) {
        // Get resource; if it exists, then PUT, else POST
        let fetched;
        await this.kubeGet(resourcePath).then(resource => {
            fetched = resource;
        }).catch(function() {
            fetched = null;
        });

        if (fetched) {
            resource.metadata.resourceVersion = fetched.body.metadata.resourceVersion
            resource.spec.clusterIP = fetched.body.spec.clusterIP;
            resource.spec.clusterIPs = fetched.body.spec.clusterIPs;
            return (await this.kubePut(resourcePath, resource)).statusCode;
        } else {
            return (await this.kubePost(kubePath, resource)).statusCode;
        }
    },
    kubeDeleteIfExists: async function(path) {
        let fetched;
        await this.kubeGet(path).then(resource => {
            fetched = resource;
        }).catch(function(err) {
            fetched = null;
        });

        if (fetched) {
            return (await this.kubeDelete(path)).statusCode;
        }
        return 0;
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
        if (!kubeData.config) {
            throw new Error('Config not set');
        }
        if (!kubeData.redisPass) {
            throw new Error('Cannot push config until redis password is set');
        }
        kubeData.config.configured = true;
        try {
            let configResource = duplicateObject(this.resources.configmaps.config);
            configResource.data[path.basename(GUARDIAN_CONFIG_FILE)] = JSON.stringify(kubeData.config);
            return await this.kubeApply(this.paths.kube.configMaps, this.paths.resources.configs.config, configResource);
        } catch (err) {
            const message = `Failed to push guardian config: \n${err.message}`;
            console.error(message);
            throw new Error(message);
        }
    },
    pullConfig: async function() {
        try {
            let response = await this.kubeGet(this.paths.resources.configs.config);
            kubeData.config = JSON.parse(response.body.data[path.basename(GUARDIAN_CONFIG_FILE)]);
            savedData.config = duplicateObject(kubeData.config);
            return kubeData.config;
        } catch (err) {
            console.info('No config in ConfigMap');
            return null;
        }
    },
    writeConfigFile: function() {
        fs.writeFileSync(GUARDIAN_CONFIG_FILE, JSON.stringify(kubeData.config), {flag: 'w'});
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
        if (!kubeData.redisPass) {
            throw new Error('Redis password not set');
        }
        try {
            let passBuffer = new Buffer.from(kubeData.redisPass);
            let secretResource = duplicateObject(this.resources.secrets.redisPass);
            secretResource.data.REDIS_PASS = passBuffer.toString('base64');
            return await this.kubeApply(this.paths.kube.secrets, this.paths.resources.secrets.redisPass, secretResource);
        } catch (err) {
            const message = `Failed to create redis secret: ${err.message}`;
            console.error(message);
            throw new Error(message);
        }
    },
    pullRedisPassword: async function() {
        try {
            const secretResource = await this.kubeGet(this.paths.resources.secrets.redisPass)
            let passBuffer = Buffer.from(secretResource.body.data.REDIS_PASS, 'base64');
            kubeData.redisPass = passBuffer.toString('utf-8')
            savedData.redisPass = kubeData.redisPass;
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
            let tlsResource = await this.kubeGet(this.paths.resources.secrets.tls);
            let certBuffer = Buffer.from(tlsResource.body.data['tls.crt'], 'base64');
            kubeData.tls = {};
            kubeData.tls.cert = certBuffer.toString('utf-8');
            // Don't store the key locally since we aren't using it
            savedData.tls = duplicateObject(kubeData.tls);
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
            let certBuffer = new Buffer.from(kubeData.tls.cert);
            let keyBuffer = new Buffer.from(kubeData.tls.key);
            let tlsResource = duplicateObject(this.resources.secrets.tls);
            tlsResource.data['tls.crt'] = certBuffer.toString('base64');
            tlsResource.data['tls.key'] = keyBuffer.toString('base64');
            const result = await this.kubeApply(this.paths.kube.secrets, this.paths.resources.secrets.tls, tlsResource);
            // erase local tls secret
            delete kubeData.tls.key;
            return result;
        } catch(err) {
            const message = `Failed to push TLS data: ${err.message}`
            console.error(message);
            throw new Error(message);
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
        const pem = selfSigned.generate(attrs, {days: kubeData.config.caInfo.days});
        this.setTLS({
            cert: pem.cert,
            key: pem.private
        });
    },
    /*
     * Render resources based on the config
     */
    renderFilterDeployment: function() {
        let filterResource = duplicateObject(this.resources.deployments.webfilter);
        if (!kubeData.config.sslBumpEnabled) {
            let squidContainer = filterResource.spec.template.spec.containers.find(
                container => container.name === 'squid'
            );
            // Delete the guardian tls mount since we aren't using it
            squidContainer.volumeMounts = squidContainer.volumeMounts.filter(
                mount => mount.name !== 'guardian-tls-volume'
            );
            // Remove the e2guardian container since we won't be using it
            filterResource.spec.template.spec.containers = filterResource.spec.template.spec.containers.filter(
                container => container.name !== 'e2guardian'
            );
            // Remove the tls volume since we aren't using it
            filterResource.spec.template.spec.volumes = filterResource.spec.template.spec.volumes.filter(
                volume => volume.name !== 'guardian-tls-volume'
            );
        }
        if (!kubeData.config.transparent) {
            // Remove the transocks container since we won't be using it
            filterResource.spec.template.spec.containers = filterResource.spec.template.spec.containers.filter(
                container => container.name !== 'transocks'
            );
        }
        return filterResource;
    },
    renderFilterService: function() {
        let filterServiceResource = duplicateObject(this.resources.services.webfilter);
        if (!kubeData.config.transparent) {
            // Remove transocks port since we won't be using it
            filterServiceResource.spec.ports = filterServiceResource.spec.ports.filter(
                port => port.name !== 'transocks'
            );
        }
        return filterServiceResource;
    },
    /*
     * Poll until pods are all ready
     */
    pollUntilReady: async function() {
        let errorMessage = '';
        await waitFor(async () => {
            const pods = await this.kubeGet(this.paths.kube.pods);
            pods.body.items.forEach(pod => {
                pod.status.containerStatuses.forEach(containerStatus => {
                    // Don't wait on a container that is never coming up
                    if (
                        containerStatus.state.waiting &&
                        containerStatus.state.waiting.reason === 'CrashLoopBackoff'
                    ) {
                        errorMessage = 'Error when creating container';
                        return;
                    }
                });
                if (!pod.status.phase) {
                    throw new Error ('Pod phase is missing');
                }
                if (pod.status.phase !== 'Running') {
                    throw new Error('Pods are still coming up');
                }
                if(pod.metadata.deletionTimestamp) {
                    throw new Error('Pods are not done deleting');
                }
            });
            return;
        }, {
            interval: 1000,
            timeout: 300000
        });
        if (errorMessage) {
            throw new Error(errorMessage);
        }
    },
    /*
     * Push deployments and services
     */
    deployFilter: async function() {
        const deploymentResource = this.renderFilterDeployment();
        const serviceResource = this.renderFilterService();

        try {
            await this.kubeApply(
                this.paths.kube.deployments,
                this.paths.resources.deployments.webfilter,
                deploymentResource
            );
            await this.kubeApplyService(
                this.paths.kube.services,
                this.paths.resources.services.webfilter,
                serviceResource
            );
        } catch (err) {
            throw new Error(`Failed to deploy webfilter deployment: ${err.message}`);
        }

        return 'OK';
    },
    deployRedis: async function() {
        const deploymentResource = this.resources.deployments.redis;
        const serviceResource = this.resources.services.redis;

        if (!kubeData.redisPass) {
            throw new Error('Cannot deploy redis, password not set');
        }

        try {
            await this.kubeApply(this.paths.kube.deployments, this.paths.resources.deployments.redis, deploymentResource);
            await this.kubeApplyService(this.paths.kube.services, this.paths.resources.services.redis, serviceResource);
        } catch (err) {
            throw new Error(`Failed to deploy redis: ${err.message}`);
        }

        return 'OK';
    },
    deployDNS: async function() {
        const deploymentResource = this.resources.deployments.dns;
        const serviceResource = this.resources.services.dns;

        if (!kubeData.redisPass) {
            throw new Error('Cannot deploy DNS, redis password not set');
        }

        try {
            await this.kubeApply(this.paths.kube.deployments, this.paths.resources.deployments.dns, deploymentResource);
            await this.kubeApplyService(this.paths.kube.services, this.paths.resources.services.dns, serviceResource);
        } catch (err) {
            throw new Error(`Failed to deploy DNS: ${err.message}`);
        }

        return 'OK';
    },
    reloadPod: async function(pods, prefix) {
        const targetPods = pods.filter(pod => {
            return pod.metadata.name.startsWith(prefix);
        });
        const promises = targetPods.map(targetPod => {
            const podPath = `${this.paths.kube.pods}/${targetPod.metadata.name}`;
            return this.kubeDeleteIfExists(podPath);
        });
        await Promise.all(promises);
    },
    /*
     * reload pods that are affected by updates to config and secrets
     */
    reloadPods: async function(pods) {
        // Reload webfilter on any config change
        const reloadWebFilter = (
            JSON.stringify(kubeData.config) !== JSON.stringify(savedData.config) ||
            JSON.stringify(kubeData.tls) !== JSON.stringify(savedData.tls)
        );
        // Reload redis if the redis password changes
        const reloadRedis = (kubeData.redisPass !== savedData.redisPass);
        // Reload dns on redis password change or safesearch
        const reloadDNS = (
            kubeData.redisPass !== savedData.redisPass ||
            kubeData.config.safeSearchEnforced !== savedData.config.safeSearchEnforced
        );

        let step;
        try {
            step = 'redis';
            if (reloadRedis) {
                await this.reloadPod(pods, 'redis');
            }
            await this.pollUntilReady();

            step = 'webfilter'
            if (reloadWebFilter) {
                await this.reloadPod(pods, 'webfilter');
            }

            step = 'dns'
            if (reloadDNS) {
                await this.reloadPod(pods, 'dns');
            }
            await this.pollUntilReady();
        } catch (err) {
            throw new Error(`Error reloading ${step} pods: ${err.message}`);
        }

    },
    /*
     * getKubeData is called upon initialization. It fetches all the kubernetes data needed
     * to run guardian, and stores it locally.
     */
    getKubeData: async function() {
        kubeData.config = await this.pullConfig() || new Config({});
        kubeData.redisPass = await this.pullRedisPassword();
        kubeData.tls = await this.pullTLS();
        Object.assign(savedData, duplicateObject(kubeData))
        return kubeData;
    },
    clearKubeData: async function() {
        delete kubeData.redisPass;
        delete kubeData.tls;
        delete kubeData.config;
    },
    /*
     * Initialize secrets if they have not been set
     */
    initializeSecrets: async function() {
        if (!kubeData.config) {
            throw new Error('Configuration not set');
        }
        if (!kubeData.redisPass) {
            this.rotateRedisPassword();
        }
        if (!kubeData.tls) {
            await this.rotateTLS();
        }
    },
    /*
     * Deploy the entire stack
     */
    deployAll: async function() {
        // Get pods at the beginning so we can know who needs a reload
        const pods = await this.kubeGet(this.paths.kube.pods);

        // Initialize and push data first
        await this.initializeSecrets();
        await this.pushConfig();
        await this.pushRedisPassword();

        // Close redis on the lookup
        if (kubeData.redisPass !== savedData.redisPass) {
            await lookup.closeRedis();
        }

        await this.pushTLS();

        // First deploy redis as other deployments depend on it
        await this.deployRedis();
        await this.pollUntilReady();
        // Now deploy the others
        await this.deployDNS();
        await this.deployFilter();
        await this.pollUntilReady();

        // reload pods if necessary
        await this.reloadPods(pods.body.items);

        if (kubeData.redisPass !== savedData.redisPass) {
            await lookup.openRedis(kubeData);
        }

        // Pull configuration so everything is synced
        await this.getKubeData();
        return 'OK';
    },
    /*
     * Tear down everything
     */
    tearDown: async function() {
        await this.kubeDeleteIfExists(this.paths.resources.deployments.webfilter);
        await this.kubeDeleteIfExists(this.paths.resources.services.webfilter);
        await this.kubeDeleteIfExists(this.paths.resources.deployments.dns);
        await this.kubeDeleteIfExists(this.paths.resources.services.dns);
        await this.kubeDeleteIfExists(this.paths.resources.deployments.redis);
        await this.kubeDeleteIfExists(this.paths.resources.services.redis);
    },
    /*
     * Delete kube data
     */
    eraseKubeData: async function() {
        await this.kubeDeleteIfExists(this.paths.resources.secrets.redisPass);
        await this.kubeDeleteIfExists(this.paths.resources.secrets.tls);
        await this.kubeDeleteIfExists(this.paths.resources.configs.config);
    }
});

function defclass(prototype) {
    var constructor = prototype.constructor;
    constructor.prototype = prototype;
    return constructor;
}

module.exports = Controller;