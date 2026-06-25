-- Local dev only: provision both databases + the shared app user.
-- In the cluster this is handled by the MariaDB operator (Database/User/Grant CRs),
-- NOT by this file. Keep the credentials in sync with .env / docker-compose.yml.

CREATE DATABASE IF NOT EXISTS craftverse
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS keycloak
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- App user (used by both the Go backend and Keycloak in local dev for simplicity).
-- The mariadb image already creates MARIADB_USER with access to MARIADB_DATABASE
-- (= craftverse). Here we additionally grant it the keycloak database.
CREATE USER IF NOT EXISTS 'app'@'%' IDENTIFIED BY 'app';
GRANT ALL PRIVILEGES ON craftverse.* TO 'app'@'%';
GRANT ALL PRIVILEGES ON keycloak.*   TO 'app'@'%';
FLUSH PRIVILEGES;
