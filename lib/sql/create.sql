CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, categoryText TEXT);
CREATE TABLE IF NOT EXISTS domains (domainText TEXT PRIMARY KEY, categoryId INTEGER);
