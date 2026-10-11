# Déploiement FOOT26 : GitHub → Cloudflare Pages → Supabase

## 1. Préparer Supabase sans perdre les données existantes

1. Ouvrez le projet Supabase déjà utilisé par FOOT26.
2. Allez dans **SQL Editor → New query**.
3. Ouvrez le fichier `supabase/migrations/20261011_auth_rate_limit.sql` de ce dépôt, copiez son contenu et exécutez-le.
4. Cette migration ajoute la protection contre les tentatives répétées. Elle ne supprime ni ne recrée les équipes, joueurs, matchs, événements, profils ou notifications.
5. Dans **Project Settings → API** (ou **API Keys**), récupérez le Project URL, la clé anon/publishable et la clé secrète service_role. Ne publiez jamais la clé service_role.

**N'exécutez pas `supabase/schema.sql` sur la base existante.** Ce fichier sert uniquement à créer une nouvelle base. `supabase/seed-demo.sql` est facultatif et ne doit être exécuté que si vous souhaitez les données de démonstration.

## 2. Vérifier le fonctionnement de l'authentification

L'inscription de FOOT26 passe par la fonction serveur Cloudflare, qui utilise la clé service_role pour créer un compte confirmé et un profil, puis tente d'ouvrir la session avec Supabase Auth. Ainsi, le parcours de ce site n'a pas besoin de l'e-mail de confirmation ni de Resend.

Vous n'avez pas besoin de désactiver globalement la confirmation des e-mails Supabase pour cette route. Laissez les autres réglages d'authentification inchangés. Si vous avez défini une politique de mot de passe Supabase qui exige obligatoirement des lettres ou symboles, vérifiez qu'elle autorise les codes numériques de 8 chiffres ; sinon Supabase rejettera les nouveaux codes.

## 3. Envoyer le projet sur GitHub

1. Créez un dépôt GitHub vide, ou utilisez un dépôt séparé pour éviter de mélanger cette version Cloudflare avec l'ancienne version Railway/Vercel.
2. Décompressez le projet et ouvrez un terminal dans le dossier qui contient `package.json`.
3. Exécutez :

```bash
git init
git add .
git commit -m "FOOT26 Cloudflare Pages et code personnel"
git branch -M main
git remote add origin https://github.com/VOTRE-COMPTE/VOTRE-DEPOT.git
git push -u origin main
```

Si le dossier est déjà un dépôt Git, vérifiez d'abord `git remote -v` et ne réinitialisez pas le dépôt sans sauvegarde.

## 4. Créer le site Cloudflare Pages

1. Ouvrez https://dash.cloudflare.com/ et allez dans **Workers & Pages → Create → Pages → Connect to Git** (le libellé peut évoluer).
2. Connectez GitHub et sélectionnez le dépôt FOOT26.
3. Paramètres de build :
   - **Framework preset** : None / Other
   - **Build command** : `npm run check`
   - **Build output directory** : `public`
   - **Root directory** : la racine du dépôt, là où se trouve `package.json`
4. Créez le projet. Cloudflare installera les dépendances puis publiera le contenu de `public/` et les fonctions de `functions/`.

## 5. Configurer les variables Cloudflare

Dans **Workers & Pages → votre projet → Settings → Variables and Secrets** (le menu peut légèrement varier), ajoutez les variables en environnement **Production** et **Preview** si vous utilisez les aperçus :

| Nom | Valeur | Type conseillé |
|---|---|---|
| `SUPABASE_URL` | URL du projet Supabase | Variable |
| `SUPABASE_ANON_KEY` | Clé anon/publishable | Variable |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service_role/secret | **Secret** |

Ne mettez jamais la clé service_role dans le HTML, un fichier JavaScript du navigateur ou le dépôt GitHub. Enregistrez les variables puis relancez un déploiement.

## 6. Promouvoir un administrateur

Après avoir créé votre compte depuis le site, ouvrez Supabase SQL Editor et exécutez en remplaçant l'adresse :

```sql
update public.profiles
set role = 'admin'
where id = (
  select id from auth.users where lower(email) = lower('votre-email@example.com')
);
```

Déconnectez-vous puis reconnectez-vous pour rafraîchir les droits. Ne donnez jamais le rôle admin aux comptes non fiables.

## 7. Tests après déploiement

Ouvrez `https://VOTRE-SITE.pages.dev/api/health`. Le résultat attendu est `{"ok":true,"app":"FOOT26","database":"connected"}`.

Testez ensuite, dans cet ordre :

1. Créer un compte de test avec un e-mail que vous contrôlez, un nom et deux fois le même code à 8 chiffres.
2. Vérifier que le compte est connecté automatiquement.
3. Se déconnecter et se reconnecter avec le bon code.
4. Essayer un code incorrect : l'accès doit être refusé.
5. Réessayer de créer un compte avec la même adresse : aucun deuxième compte ne doit être créé.
6. Vérifier qu'un compte existant peut toujours se connecter avec son ancien mot de passe, si celui-ci n'a pas été remplacé.
7. Vérifier le classement, le calendrier, les statistiques, les clubs et les notifications.
8. Vérifier qu'un utilisateur normal ne peut pas créer/modifier/supprimer des données administratives.
9. Tester la saisie d'un résultat et les événements d'un match joué.

Si un test échoue, consultez **Workers & Pages → Logs** dans Cloudflare et **Logs → Auth / Postgres** dans Supabase. Ne copiez jamais les secrets dans un ticket ou une conversation.

## 8. Ce que cette version ne peut pas garantir à distance

La vérification de syntaxe ne peut pas prouver la disponibilité de votre projet Supabase, la justesse de ses relations actuelles, ni l'état des secrets dans Cloudflare. Il faut effectuer les tests ci-dessus avec votre propre base avant d'annoncer le site comme opérationnel.
