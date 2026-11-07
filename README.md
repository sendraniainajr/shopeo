# Shopeo

Boutique de démonstration française, en EUR, avec une interface responsive inspirée de la référence Robo.io : violet, turquoise, orange et une mascotte originale. Produits, adresses de test, commandes et paiements sont fictifs. Aucun débit bancaire et aucun email réel.

## Architecture

- `web/` : Next.js 16, React 19, TypeScript, composants et pages séparés. Le navigateur accède uniquement au BFF `/api` de Next.js.
- `api/` : FastAPI, SQLAlchemy et Alembic. Le serveur calcule les prix, réserve le stock et contrôle les droits.
- PostgreSQL : portable en local, Supabase en ligne. Le schéma privé `shopeo` n'est pas exposé à l'API publique Supabase. Aucune clé Supabase n'est nécessaire dans le navigateur.
- `automation/` : n8n local et dépendances séparées. Les événements transitent par une outbox durable ; les callbacks sont signés avec HMAC et protégés contre le rejeu.
- Vercel Services : interface Next.js publique et service FastAPI privé, reliés par `SHOPEO_API_URL`. Les secrets restent côté serveur.

## Développement local

Node.js 22+ et Python 3.13 sont requis. Depuis la racine du dépôt :

```powershell
npm ci
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r api/requirements.txt
node scripts/dev.mjs
```

L'interface est accessible sur http://127.0.0.1:3100 et l'API sur http://127.0.0.1:8100. PostgreSQL écoute uniquement sur 127.0.0.1:55432. Le script attend la disponibilité des services. Les fichiers privés sont créés dans `.runtime/`, exclu de Git. Les comptes de démonstration locaux sont générés dans `.runtime/local-accounts.json` ; les raccourcis de connexion de démonstration sont interdits sur Vercel.

## Simulation n8n réelle

```powershell
npm ci --prefix automation
node scripts/configure-n8n.mjs
node scripts/n8n.mjs import:workflow --input E:/chemin/absolu/shopeo/.runtime/workflow.json
node scripts/n8n.mjs publish:workflow --id shopeoDemoWorkflow
node scripts/n8n.mjs start
```

Redémarrer FastAPI et son worker après la configuration pour charger `.runtime/automation.env`. n8n écoute sur http://127.0.0.1:5679. Ne pas exposer cette instance locale sur Internet. Le workflow appelle FastAPI avec le corps original signé ; il ne contient aucune clé d'IA et n'envoie aucun email. Les brouillons d'assistance exigent une validation dans l'administration.

Sans n8n configuré, le worker utilise un traitement local explicite et la boîte de messages de démonstration. En ligne, ce traitement est lancé après les mutations ; un cron quotidien reprend les événements en attente. Cela ne constitue pas un hébergement n8n permanent. Pour une exploitation continue, déployer n8n et le worker sur un hébergement adapté, puis configurer `N8N_WEBHOOK_URL` et `AUTOMATION_SECRET`.

L'IA externe est désactivée par défaut. Un brouillon déterministe reste disponible. Une passerelle compatible `chat/completions` peut être configurée avec `AI_ALLOW_EXTERNAL=1`, `AI_GATEWAY_URL`, `AI_API_KEY`, `AI_MODEL`. Les données envoyées sont réduites et les coordonnées masquées ; le résultat ne déclenche aucune action autonome.

## Contrôles

```powershell
npm run typecheck
npm run build
.venv\Scripts\python.exe -m pytest api/tests -q
```

Les tests utilisent une base distincte `shopeo_test` et couvrent notamment la concurrence sur le dernier article, les montants serveur, l'idempotence des paiements, l'isolation des commandes, CSRF, les droits administrateur, la réinitialisation de session, le rejeu HMAC et la reprise de l'outbox. La CI GitHub utilise PostgreSQL 18. Les captures d'interface sont dans `design-verification/`.

## Déploiement Vercel et Supabase

Avant le premier déploiement sur une base neuve, provisionner les deux rôles techniques dédiés et exécuter `api/provision.sql` comme propriétaire de la base. Cette étape crée le schéma privé avant la table de version Alembic. Elle a déjà été réalisée pour le projet Supabase Shopeo. Le rôle migrator reste limité à ce schéma ; il n'a pas de droit CREATE sur toute la base. Le script de migration vérifie ce prérequis et s'arrête avec une erreur explicite s'il manque.

Importer ce dépôt à sa racine. `vercel.json` décrit les deux services ; `api/build.py` applique les migrations Alembic et initialise uniquement le catalogue fictif. Configurer des secrets de production, sans préfixe `NEXT_PUBLIC_` :

- `DATABASE_URL` : compte `shopeo_runtime`, pooler transaction PostgreSQL, SSL obligatoire ; préparations psycopg désactivées.
- `MIGRATION_DATABASE_URL` : compte `shopeo_migrator`, pooler session, réservé aux migrations du schéma privé.
- `DATABASE_SCHEMA=shopeo`, `LOCAL_DEMO=0`, `COOKIE_SECURE=1`, `AUTO_CREATE_SCHEMA=0`, `SEED_DEMO=0`, `PAYMENTS_SIMULATED=1`, `AI_ALLOW_EXTERNAL=0`.
- `INTERNAL_PROXY_SECRET` et `CRON_SECRET` : valeurs aléatoires distinctes d'au moins 32 caractères.

Le déploiement ne crée pas automatiquement de comptes métier. L'inscription client est disponible. Pour initialiser un administrateur, fournir ponctuellement `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` (20 caractères minimum), `BOOTSTRAP_ADMIN_TOTP_SECRET` (secret TOTP base32, 32 caractères minimum), puis retirer ces variables après le premier déploiement. Le bootstrap refuse de promouvoir un compte existant. Les secrets d'administration doivent être remis par un canal privé, jamais dans Git.

Ne pas partager la base de production avec des branches non fiables. Utiliser une base séparée pour les previews. Le compte runtime dispose de SELECT/INSERT/UPDATE métier et de DELETE uniquement sur sessions, jetons de réinitialisation et compteurs de limitation. La RLS autorise ce rôle serveur ; l'autorisation par utilisateur est effectuée dans FastAPI. La table Alembic sans politique runtime est volontairement inaccessible à ce rôle.

## Sauvegarde et limites

`api/backup.py --verify` produit une sauvegarde chiffrée avec Fernet et un contrôle de restauration dans une base dédiée `shopeo_restore_test`. Conserver la clé séparément de la sauvegarde. Le chiffrement seul ne remplace pas une rétention externe et des exercices de restauration planifiés.

Cette version est un laboratoire sérieux, pas une boutique autorisée à encaisser. Avant une vente réelle : intégrer un prestataire de paiement et ses webhooks vérifiés, un transporteur, un fournisseur email, la conformité commerciale et vie privée du marchand, une supervision et des sauvegardes externalisées. Les messages capturés, la livraison fixe et la TVA de démonstration sont explicitement simulés. Mailpit dans `compose.yaml` est optionnel et n'est pas connecté au transport actuel.
