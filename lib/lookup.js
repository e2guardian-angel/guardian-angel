'use strict'
const fs = require('fs');
const find = require('findit');
const path = require('path');
const uuid = require('uuid');
const sqlite3 = require('sqlite3-lite');
const {open} = require('sqlite');
const { Pool } = require('pg');

function Lookup() {
    this.initialized = false;
}

Lookup.prototype.createDbConnection = function() {
    const options = {
        host: process.env.POSTGRES_host || 'guardian-db',
        port: process.env.POSTGRES_port || 5432,
        user: process.env.POSTGRES_user || 'acluser',
        password: process.env.POSTGRES_PASSWORD,
        database: process.env.POSTGRES_lookup_db || 'acls'
    };
    return new Pool(options);
};

Lookup.prototype.init = async function() {
    this.db = await this.createDbConnection();
    let initSql = fs.readFileSync(`${__dirname}/sql/create.sql`).toString().split('\n');
    try {
        for(let i=0; i < initSql.length; i++) {
            if (initSql[i] !== '') {
                await this.db.query(initSql[i]);
            }
        }
    } catch (err) {
        console.error(`Failed to initialize database: ${err.message}`);
    }
    this.initialized = true;
};

/*
 * WARNING: This clears out the entire lookup db.
 */
Lookup.prototype.cleanup = async function() {
    if (!this.initialized) {
        throw Error('Database has not been initialized');
    }
    let deleteSql = fs.readFileSync(`${__dirname}/sql/delete.sql`).toString().split('\n');
    try {
        for(let i = 0; i < deleteSql.length; i++) {
            await this.db.query(deleteSql[i]);
        }
    } catch (err) {
        console.error(`Failed to initialize database: ${err.message}`);
    }
    this.initialized = false;
};

Lookup.prototype.close = async function() {
    try {
        if (this.db) {
            await this.db.end();
        }
    } catch(err) {
        console.error(`Failed to close sqlite db: ${err.message}`);
    }
};

Lookup.prototype.addHostName = async function(hostname, category) {
    if (!this.initialized) {
        throw Error('Database has not been initialized');
    }
    if (!hostname || hostname.split('.').indexOf('') > -1 || hostname.length > 128) {
        throw Error(`Invalid hostname: ${hostname}`);
    }
    const categorySql = 'INSERT INTO categories(categoryText)' +
        ' SELECT $1 WHERE NOT EXISTS(SELECT 1 FROM categories WHERE categoryText = $1);';
    const domainSql = 'INSERT INTO domains(domainText, categoryId) ' +
        ' SELECT $1, id FROM categories WHERE categoryText = $2' +
        ' AND NOT EXISTS(SELECT 1 FROM domains WHERE domainText = $1 AND categoryId = id);'
    try {
        await this.db.query(categorySql, [category]);
        await this.db.query(domainSql, [hostname, category]);
    } catch (err) {
        console.error(err.message);
    }
};

Lookup.prototype.lookupHostName = async function(hostname, category) {
    if (!this.initialized) {
        throw Error('Database has not been initialized');
    }
    let parts = hostname.split('.');
    const generalSql = 'SELECT domains.domainText, categories.categoryText FROM domains ' +
        'INNER JOIN categories ON domains.categoryId = categories.id ' +
        'WHERE domainText = $1;';
    while(parts.length > 1) {
        let domain = parts.join('.');
        try {
            const result = await this.db.query(generalSql, [domain]);
            if (result.rows.length > 0) {
                if (category === 'any') {
                    return result.rows[0];
                }
                const matches = result.rows.filter(row => row.categorytext === category);
                if (matches.length > 0) {
                    return matches[0];
                } else {
                    // This isn't a match
                    return null;
                }
            }
            parts.shift();
        } catch (err) {
            console.error(err.message);
        }
    }

    return null;
};

Lookup.prototype.loadDomainsFile = async function(domainsFile, category) {
    if (!this.initialized) {
        throw Error('Database has not been initialized');
    }
    try {
        const data = fs.readFileSync(`${domainsFile}`);
        const domains = data.toString().split('\n');

        const categorySql = 'INSERT INTO categories(categoryText)' +
            ' SELECT $1 WHERE NOT EXISTS(SELECT 1 FROM categories WHERE categoryText = $1);';

        await this.db.query(categorySql, [category]);

        const getCategoryId = 'SELECT id FROM categories WHERE categoryText = $1'

        const categoryId = (await this.db.query(getCategoryId, [category])).rows[0].id;

        const domainSql = 'INSERT INTO domains(domainText, categoryId) VALUES '

        await this.db.query('BEGIN TRANSACTION');
        //const stmt = await this.db.prepare(domainSql);

        let sqlArgs = [];
        let args = [categoryId];
        for(let i = 0; i < domains.length; i++) {
            let domain = domains[i].trim();
            if (domain) {
                if (domain.substring(domain.length-1) === '.') {
                    domain = domain.substring(0,domain.length-1);
                }
                if (args.length === 100 || i === (domains.length - 1)) {
                    // Do the query here
                    let queryStr = domainSql + sqlArgs.join(',') + ';';
                    const query = {
                        name: `populate-${category}-domains`,
                        text: queryStr,
                        values: args
                    };
                    await this.db.query(query).catch(() => {});
                    sqlArgs = [];
                    args = [categoryId];
                } else {
                    sqlArgs.push(`($${args.length+1}, $1)`);
                    args.push(domain);
                }
            }
        }
        //await stmt.finalize();

        await this.db.query('END TRANSACTION');

    } catch (err) {
        console.error(err.message);
    }
};

Lookup.prototype.loadDomainsDirectory = async function(directory) {
    if (!this.initialized) {
        throw Error('Database has not been initialized');
    }
    let lists = [];
    let findPromise = new Promise(function(resolve, reject) {
        const finder = find(directory);
        finder.on('file', async function (file, stat) {
            const filename = path.basename(file);
            if (filename === 'domains') {
                let category = file.replace(filename, '').replace(directory, '');
                category = (category.split('/').filter(s => s != '')).join('/');
                lists.push({file: file, category: category});
            }
        });
        finder.on('end', resolve);
        finder.on('error', reject);
    });
    await findPromise;
    for(let i = 0; i < lists.length; i++) {
        const list = lists[i];
        await this.loadDomainsFile(list.file, list.category);
    }
}

module.exports = Lookup;
