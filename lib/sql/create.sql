CREATE SEQUENCE IF NOT EXISTS categories_id_seq;
CREATE TABLE IF NOT EXISTS categories (id INTEGER NOT NULL DEFAULT nextval('categories_id_seq'), categorytext text);
CREATE TABLE IF NOT EXISTS domains (domainText TEXT NOT NULL, categoryId INTEGER NOT NULL, CONSTRAINT PK_DOMAINS PRIMARY KEY (domainText, categoryId));
