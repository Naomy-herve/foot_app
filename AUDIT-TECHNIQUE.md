# FOOT26 2.1.1 — rapport de contrôle technique

## Corrections intégrées dans cette archive

- Quotas d'inscription/connexion séparés par adresse IP et par e-mail ; le quota e-mail n'est plus limité à une combinaison IP+e-mail.
- Notifications générées lors de l'ajout d'un but ou d'un carton ; notification du résultat lors de l'enregistrement d'un résultat.
- Vérification des champs obligatoires pour les créations et refus des mises à jour vides.
- Échappement de champs texte dynamiques supplémentaires dans l'interface et lecture plus robuste des données de session stockées dans le navigateur.
- Vérification statique supplémentaire : migration non destructive, routes attendues, appels du limiteur, notification de but et absence de clé service_role dans le HTML.

## Vérifications exécutées dans l'environnement de préparation

- `node --check functions/api/[[path]].js` : réussi.
- `node scripts/check-project.mjs` : réussi.
- Vérification ZIP par `unzip -t` : exécutée lors de la génération de l'archive.

## Limites de vérification — à lire avant la production

Ces contrôles sont statiques. L'environnement de préparation n'a pas confirmé une installation complète des dépendances, un build Cloudflare distant, une connexion au projet Supabase réel, des tests navigateur de bout en bout, ni des tests de charge ou de sécurité indépendants. Aucun logiciel ne peut être garanti « sans aucun défaut possible ».

L'archive de base qui a servi à construire cette version est la source Vercel fournie précédemment, pas le dépôt Railway qui utilise `server/server.js`. Cette version Cloudflare ne doit donc pas remplacer la production Railway tant que la compatibilité du schéma Supabase et toutes les fonctionnalités ne sont pas validées.

## Déploiement prudent

1. Faire une sauvegarde Supabase et déployer cette archive dans un projet Cloudflare de test séparé.
2. Sur une base déjà utilisée, exécuter uniquement `supabase/migrations/20261011_auth_rate_limit.sql`. Ne pas rejouer `supabase/schema.sql` sur la production.
3. Configurer `SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` comme variables/secrets Cloudflare. La clé service role doit rester exclusivement côté serveur.
4. Tester inscription, auto-connexion, connexion correcte/incorrecte, e-mail dupliqué, limites anti-abus, compte existant, permissions admin, CRUD de chaque table, résultats, classement, statistiques et notifications.
5. Ne basculer le trafic qu'après réussite des tests et vérification des journaux.
