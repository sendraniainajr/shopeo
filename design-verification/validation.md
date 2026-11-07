# Validation du 7 novembre 2026

- 22 tests FastAPI sur PostgreSQL local isolé : réussis. Stock concurrent, montant serveur, idempotence, expiration des réservations, autorisations, CSRF, récupération d'accès et HMAC/rejeu inclus.
- Typage TypeScript et compilation Next.js de production : réussis.
- CI GitHub de la première version : les deux contrôles push et pull request ont réussi.
- Build Vercel Services : Next.js et FastAPI construits et publiés. Les dépendances Python sont déclarées dans `pyproject.toml`, utilisé prioritairement par Vercel.
- Supabase : 12 produits et 18 variantes ; schéma privé non accessible aux rôles publics `anon` et `authenticated`. RLS activée sur les tables. L'avis informatif « RLS sans politique » de la table de versions Alembic est volontaire : le compte runtime ne doit pas y accéder.
- Compte runtime Supabase : inscription fictive, refus d'accès admin, commande simulée, outbox traitée, brouillon supervisé et déconnexion vérifiés.
- Site public : API PostgreSQL, cookies Secure et HttpOnly, CSRF, inscription fictive, commande à 23,90 EUR, paiement idempotent, demande d'assistance et déconnexion vérifiés sur HTTPS.
- n8n local réel : workflow publié, événement signé, callback authentifié, reçu idempotent et brouillon enregistré. Aucun transport email réel.
- Sauvegarde chiffrée et restauration dans une base locale distincte vérifiées pendant le développement.

La capture desktop correspond au design violet/turquoise/orange publié. Les captures sont des preuves visuelles, pas des tests automatisés d'accessibilité. La vérification responsive doit être reprise après chaque changement important de mise en page.

Limites d'exploitation : paiement et livraison fictifs, emails capturés en base, IA externe désactivée, n8n hébergé uniquement en local. Le site public utilise le traitement local d'outbox avec reprise quotidienne. L'administration distante nécessite l'initialisation privée d'un compte avec TOTP ; les raccourcis admin locaux sont désactivés en ligne.
