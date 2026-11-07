-- Exécuter une seule fois comme propriétaire de la base, après la création
-- des rôles shopeo_migrator et shopeo_runtime avec des mots de passe privés.
-- Cette étape d'infrastructure précède Alembic ; elle n'est jamais exécutée
-- avec le compte runtime ni dans une requête web.
CREATE SCHEMA IF NOT EXISTS shopeo;
REVOKE ALL ON SCHEMA shopeo FROM PUBLIC, anon, authenticated;
GRANT USAGE, CREATE ON SCHEMA shopeo TO shopeo_migrator;
GRANT USAGE ON SCHEMA shopeo TO shopeo_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE shopeo_migrator IN SCHEMA shopeo
  GRANT SELECT, INSERT, UPDATE ON TABLES TO shopeo_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE shopeo_migrator IN SCHEMA shopeo
  GRANT USAGE, SELECT ON SEQUENCES TO shopeo_runtime;
