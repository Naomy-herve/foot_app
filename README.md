# FOOT26 — Cloudflare Pages + Supabase

Version de préparation au déploiement : **2.1.1**. Interface web statique, API Cloudflare Pages Functions et Supabase Auth/PostgreSQL.

## Fonctionnement de l'authentification

- Inscription : nom d'utilisateur, e-mail, code personnel exactement composé de 8 chiffres et confirmation du code.
- La fonction serveur crée l'utilisateur Supabase avec `email_confirm: true`, crée son profil, puis ouvre automatiquement une session.
- Connexion : e-mail et code personnel. Les anciens comptes peuvent continuer à utiliser leur ancien mot de passe (pour ne pas les bloquer immédiatement).
- Une adresse déjà utilisée ne crée pas un deuxième compte.
- Les tentatives sont limitées par IP et par adresse e-mail via une fonction SQL atomique.
- Le code n'est jamais stocké dans une table applicative ni écrit dans les journaux. Supabase Auth stocke le mot de passe selon ses mécanismes sécurisés.

**Limite de sécurité assumée :** sans vérification d'adresse, une personne peut créer un compte en utilisant une adresse e-mail qui ne lui appartient pas. Le code numérique à 8 chiffres est plus faible qu'un mot de passe long. Le limiteur de tentatives réduit les risques, mais n'élimine pas cette faiblesse. Ne réutilisez pas ce code sur d'autres services.

## Arborescence

```text
FOOT26/
├── public/index.html
├── functions/api/[[path]].js
├── supabase/schema.sql
├── supabase/migrations/20261011_auth_rate_limit.sql
├── supabase/seed-demo.sql
├── package.json
├── wrangler.toml
├── .dev.vars.example
├── .env.example
└── DEPLOIEMENT-CLOUDFLARE.md
```

## Important pour une base existante

Ne lancez pas `supabase/schema.sql` sur la base FOOT26 qui contient déjà les équipes, matchs et joueurs : ce fichier est destiné à un **nouveau projet**. Pour la base existante, exécutez uniquement `supabase/migrations/20261011_auth_rate_limit.sql` dans le SQL Editor. Cette migration ajoute la table de limitation et sa fonction, sans supprimer les données du championnat.

## Développement local

1. Installez Node.js 20 ou plus récent.
2. Copiez `.dev.vars.example` vers `.dev.vars` et renseignez les trois valeurs Supabase.
3. Installez et lancez :

```bash
npm install
npm run check
npm run dev
```

Le site local s'affiche sur l'adresse donnée par Wrangler (habituellement `http://localhost:8788`). `.dev.vars` est ignoré par Git.

## Déploiement

Suivez `DEPLOIEMENT-CLOUDFLARE.md`. La clé `SUPABASE_SERVICE_ROLE_KEY` doit être ajoutée comme **secret** Cloudflare, jamais dans `public/`, le HTML, GitHub ou `.dev.vars.example`.
