'use strict';
const ejs = require('ejs');
const fs = require('fs');

function cert(req, res) {
    const overview = fs.readFileSync(`${__dirname}/views/overview-content.html`, 'utf-8');
    const profiles = fs.readFileSync(`${__dirname}/views/profiles-content.html`);
    const filter = fs.readFileSync(`${__dirname}/views/filter-content.html`);
    const categories = fs.readFileSync(`${__dirname}/views/categories-content.html`);
    const phrases = fs.readFileSync(`${__dirname}/views/phrases-content.html`);
    const advanced = fs.readFileSync(`${__dirname}/views/advanced-content.html`);
    res.status(200).send(ejs.render(fs.readFileSync(`${__dirname}/views/dashboard.html`, 'utf-8'), {
        overviewContent: overview,
        profilesContent: profiles,
        filterContent: filter,
        categoriesContent: categories,
        phrasesContent: phrases,
        advancedContent: advanced
    }));
}

module.exports = cert;