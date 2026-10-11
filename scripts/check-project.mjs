import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
if (!inlineScripts.length) throw new Error('Aucun script client trouvé dans public/index.html');
inlineScripts.forEach((match, index) => new vm.Script(match[1], { filename: `public/index.html:inline-script-${index + 1}` }));
const api = fs.readFileSync(new URL('../functions/api/[[path]].js', import.meta.url), 'utf8');
if (!api.includes("email_confirm: true")) throw new Error('La création de compte doit confirmer le compte côté serveur.');
if (!api.includes("foot26_allow_auth_attempt")) throw new Error('Le limiteur d’authentification SQL n’est pas appelé.');
if (!api.includes("scope.endsWith('-ip')")) throw new Error('Les quotas IP et e-mail doivent être indépendants.');
if (!api.includes('But de ${player.name}')) throw new Error('La notification de but est absente.');
if (!api.includes('Certains champs obligatoires sont manquants.')) throw new Error('La validation des champs obligatoires est absente.');
const migration = fs.readFileSync(new URL('../supabase/migrations/20261011_auth_rate_limit.sql', import.meta.url), 'utf8');
if (/\b(drop\s+table|truncate\s+table|delete\s+from\s+public\.(teams|players|matches|events|profiles))\b/i.test(migration)) throw new Error('La migration contient une opération destructive interdite.');
if (/SUPABASE_SERVICE_ROLE_KEY\s*=\s*['"][^'"]+['"]/.test(html)) throw new Error('Une clé service_role semble être intégrée au HTML.');
for (const required of ['register', 'login', 'standings', 'stats', 'matches_home_id_fkey']) {
  if (!api.includes(required)) throw new Error(`Route API attendue absente : ${required}`);
}
console.log(`Contrôles réussis : syntaxe API, ${inlineScripts.length} script(s) client, routes et vérifications de sécurité statiques.`);
