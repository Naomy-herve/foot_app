import { createClient } from '@supabase/supabase-js';

const TABLES = {
  teams: ['name', 'city', 'stadium_id', 'coach'],
  stadiums: ['name', 'city', 'capacity'],
  referees: ['name', 'country'],
  players: ['name', 'team_id', 'pos', 'number'],
  matches: ['home_id', 'away_id', 'date', 'stadium_id', 'referee_id', 'hg', 'ag', 'played'],
  events: ['match_id', 'player_id', 'type', 'minute']
};
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});
const fail = (message, status = 400) => json({ error: message }, status);
const cleanEmail = value => String(value || '').trim().toLowerCase();
const validName = value => typeof value === 'string' && value.trim().length >= 2 && value.trim().length <= 60;
const digitsOnly = value =>
  typeof value === 'string' &&
  value.length >= 8 &&
  value.length <= 128;
const safeError = error => error?.message || 'Une erreur est survenue.';

function clients(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Configuration Supabase incomplète. Vérifiez les variables Cloudflare.');
  }
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  return {
    db: createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, options),
    anon: createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, options)
  };
}
async function dataOrThrow(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
async function readBody(request) {
  try { return await request.json(); }
  catch { throw Object.assign(new Error('Corps JSON invalide.'), { status: 400 }); }
}
function pick(input, columns) {
  const result = {};
  for (const column of columns) {
    if (input[column] === undefined || input[column] === '') continue;
    result[column] = input[column];
  }
  for (const key of ['stadium_id', 'referee_id', 'team_id', 'home_id', 'away_id', 'player_id', 'match_id', 'number', 'capacity', 'hg', 'ag', 'minute']) {
    if (result[key] !== undefined && result[key] !== null) {
      const n = Number(result[key]);
      if (!Number.isInteger(n)) throw Object.assign(new Error(`Valeur numérique invalide : ${key}.`), { status: 400 });
      result[key] = n;
    }
  }
  if (result.played !== undefined) result.played = result.played === true || result.played === 'true';
  return result;
}
async function hashKey(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function requestIp(request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}
async function allowAttempt(db, request, scope, limit, email = '') {
  // IP quotas are independent of the email; email quotas are shared across IPs.
  const raw = scope.endsWith('-ip') ? `${scope}|${requestIp(request)}` : `${scope}|${email}`;
  const key = await hashKey(raw);
  const { data, error } = await db.rpc('foot26_allow_auth_attempt', {
    p_key: key,
    p_limit: limit,
    p_window_seconds: 900
  });
  if (error) throw Object.assign(new Error('Protection anti-abus non configurée. Appliquez la migration SQL fournie.'), { status: 503 });
  return data === true;
}
async function getRequestUser(request, db) {
  const header = request.headers.get('authorization') || '';
  const token = header.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) return null;
  const { data: profile, error: profileError } = await db.from('profiles').select('name,role').eq('id', data.user.id).maybeSingle();
  if (profileError || !profile) return null;
  return { id: data.user.id, name: profile.name, role: profile.role };
}
async function makeSession(anon, db, email, password) {
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data?.session || !data?.user) {
    throw Object.assign(new Error('Adresse e-mail ou code incorrect.'), { status: 401 });
  }
  const profile = await dataOrThrow(db.from('profiles').select('name,role').eq('id', data.user.id).single());
  return { token: data.session.access_token, user: { id: data.user.id, name: profile.name, role: profile.role } };
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const method = request.method.toUpperCase();
  if (!url.pathname.startsWith('/api/')) return fail('Route introuvable.', 404);

  let db, anon;
  try { ({ db, anon } = clients(env)); }
  catch (error) { return fail(safeError(error), 503); }

  try {
    if (parts[0] === 'health' && method === 'GET') {
      const { error } = await db.from('teams').select('id', { head: true, count: 'exact' });
      if (error) return json({ ok: false, app: 'FOOT26', database: 'error' }, 503);
      return json({ ok: true, app: 'FOOT26', database: 'connected' });
    }

    if (parts.length === 1 && parts[0] === 'register' && method === 'POST') {
      const body = await readBody(request);
      const email = cleanEmail(body.email);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const password = String(body.password || '');
      const confirmation = String(body.confirmPassword ?? body.confirmCode ?? '');
      if (!validName(name)) return fail('Le nom d’utilisateur doit contenir entre 2 et 60 caractères.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return fail('Adresse e-mail invalide.');
      if (!digitsOnly(password)) return fail('Choisissez un code personnel composé exactement de 8 chiffres.');
      if (confirmation !== password) return fail('Les deux codes ne correspondent pas.');
      if (!(await allowAttempt(db, request, 'register-ip', 20))) return fail('Trop de tentatives. Réessayez dans 15 minutes.', 429);
      if (!(await allowAttempt(db, request, 'register-email', 3, email))) return fail('Trop de tentatives pour cette adresse. Réessayez dans 15 minutes.', 429);

      const { data: created, error: createError } = await db.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name }
      });
      if (createError || !created?.user) {
        return fail('Impossible de créer ce compte. Cette adresse est peut-être déjà utilisée ; essayez de vous connecter.', 409);
      }
      const { error: profileError } = await db.from('profiles').upsert({ id: created.user.id, name, role: 'user' }, { onConflict: 'id' });
      if (profileError) {
        await db.auth.admin.deleteUser(created.user.id);
        throw Object.assign(new Error('Le profil n’a pas pu être créé. Aucun compte incomplet n’a été conservé.'), { status: 500 });
      }
      try {
        return json(await makeSession(anon, db, email, password), 201);
      } catch (error) {
        // The account remains valid; the user can sign in with the code they just created.
        return json({ created: true, message: 'Compte créé. Connectez-vous avec votre e-mail et votre code personnel.' }, 201);
      }
    }

    if (parts.length === 1 && parts[0] === 'login' && method === 'POST') {
      const body = await readBody(request);
      const email = cleanEmail(body.email);
      const password = String(body.password || '');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !password) {
        return fail('Saisissez une adresse e-mail et votre code personnel.');
      }
      if (!(await allowAttempt(db, request, 'login-ip', 30))) return fail('Trop de tentatives. Réessayez dans 15 minutes.', 429);
      if (!(await allowAttempt(db, request, 'login-email', 10, email))) return fail('Trop de tentatives pour cette adresse. Réessayez dans 15 minutes.', 429);
      return json(await makeSession(anon, db, email, password));
    }

    const user = await getRequestUser(request, db);
    const isAdmin = user?.role === 'admin';
    const requireAdmin = () => isAdmin ? null : fail('Réservé aux administrateurs.', user ? 403 : 401);

    if (parts.length === 1 && parts[0] === 'standings' && method === 'GET') {
      const teams = await dataOrThrow(db.from('teams').select('id,name'));
      const matches = await dataOrThrow(db.from('matches').select('home_id,away_id,hg,ag,played,date').eq('played', true).order('date'));
      const rows = Object.fromEntries(teams.map(t => [t.id, { id: t.id, name: t.name, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] }]));
      for (const m of matches) {
        const home = rows[m.home_id], away = rows[m.away_id];
        if (!home || !away) continue;
        const hg = Number(m.hg || 0), ag = Number(m.ag || 0);
        home.p++; away.p++; home.gf += hg; home.ga += ag; away.gf += ag; away.ga += hg;
        if (hg > ag) { home.w++; home.pts += 3; away.l++; home.form.push('V'); away.form.push('D'); }
        else if (hg < ag) { away.w++; away.pts += 3; home.l++; away.form.push('V'); home.form.push('D'); }
        else { home.d++; away.d++; home.pts++; away.pts++; home.form.push('N'); away.form.push('N'); }
      }
      return json(Object.values(rows).map(r => ({ ...r, gd: r.gf - r.ga, form: r.form.slice(-5) })).sort((a,b) => b.pts-a.pts || b.gd-a.gd || b.gf-a.gf || a.name.localeCompare(b.name)));
    }

    if (parts[0] === 'stats' && parts[1] === 'players' && method === 'GET') {
      const [players, events] = await Promise.all([
        dataOrThrow(db.from('players').select('id,name,pos,team_id,teams(name)')),
        dataOrThrow(db.from('events').select('player_id,type'))
      ]);
      const stats = {};
      for (const e of events) {
        if (!stats[e.player_id]) stats[e.player_id] = { goal: 0, yellow: 0, red: 0 };
        if (Object.hasOwn(stats[e.player_id], e.type)) stats[e.player_id][e.type]++;
      }
      return json(players.map(p => ({ id: p.id, name: p.name, pos: p.pos, team: p.teams?.name || '', team_id: p.team_id, goals: stats[p.id]?.goal || 0, yellow: stats[p.id]?.yellow || 0, red: stats[p.id]?.red || 0 }))
        .sort((a,b) => b.goals-a.goals || a.yellow-b.yellow || a.name.localeCompare(b.name)));
    }

    if (parts.length === 2 && parts[0] === 'matches' && parts[1] === 'full' && method === 'GET') {
      const matches = await dataOrThrow(db.from('matches').select('*, home:teams!matches_home_id_fkey(name), away:teams!matches_away_id_fkey(name), stadium:stadiums(name), referee:referees(name)').order('date'));
      return json(matches.map(m => ({ ...m, home: m.home?.name || '', away: m.away?.name || '', stadium: m.stadium?.name || '', referee: m.referee?.name || '' })));
    }
    if (parts.length === 1 && parts[0] === 'notifications' && method === 'GET') {
      return json(await dataOrThrow(db.from('notifications').select('*').order('id', { ascending: false }).limit(15)));
    }
    if (parts.length === 1 && parts[0] === 'events' && method === 'GET') {
      return json(await dataOrThrow(db.from('events').select('*')));
    }

    if (parts.length === 1 && method === 'GET' && TABLES[parts[0]]) {
      return json(await dataOrThrow(db.from(parts[0]).select('*').order('id')));
    }

    if (parts.length === 1 && method === 'POST' && TABLES[parts[0]]) {
      const denied = requireAdmin(); if (denied) return denied;
      const table = parts[0];
      const body = await readBody(request);
      if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('Le corps doit être un objet JSON.');
      const rowInput = pick(body, TABLES[table]);
      const required = { teams: ['name'], stadiums: ['name'], referees: ['name'], players: ['name','team_id'], matches: ['home_id','away_id','date'], events: ['match_id','player_id','type'] }[table] || [];
      if (required.some(key => rowInput[key] === undefined || rowInput[key] === null || rowInput[key] === '')) return fail('Certains champs obligatoires sont manquants.');
      if (['teams','stadiums','referees','players'].includes(table) && (typeof rowInput.name !== 'string' || !rowInput.name.trim() || rowInput.name.trim().length > 120)) return fail('Le nom doit contenir entre 1 et 120 caractères.');
      if (table === 'matches' && rowInput.home_id === rowInput.away_id) return fail('Une équipe ne peut pas jouer contre elle-même.');
      if (table === 'matches' && ((rowInput.hg !== undefined && rowInput.hg < 0) || (rowInput.ag !== undefined && rowInput.ag < 0))) return fail('Les scores ne peuvent pas être négatifs.');
      if (table === 'events') {
        if (!rowInput.match_id || !rowInput.player_id || !Number.isInteger(rowInput.minute)) return fail('Match, joueur et minute sont obligatoires.');
        if (!['goal','yellow','red'].includes(rowInput.type)) return fail('Type d’événement invalide.');
        if (rowInput.minute < 0 || rowInput.minute > 130) return fail('La minute doit être comprise entre 0 et 130.');
        const match = await dataOrThrow(db.from('matches').select('home_id,away_id,played').eq('id', rowInput.match_id).single());
        const player = await dataOrThrow(db.from('players').select('team_id,name').eq('id', rowInput.player_id).single());
        if (![match.home_id, match.away_id].includes(player.team_id)) return fail('Le joueur doit appartenir à l’une des équipes du match.');
        if (!match.played) return fail('Enregistrez le résultat du match avant ses buts et cartons.');
      }
      const row = await dataOrThrow(db.from(table).insert(rowInput).select().single());
      if (table === 'events') {
        const player = await dataOrThrow(db.from('players').select('name').eq('id', row.player_id).single());
        const text = row.type === 'goal' ? `But de ${player.name} (${row.minute}')` : `Carton ${row.type === 'red' ? 'rouge' : 'jaune'} pour ${player.name} (${row.minute}')`;
        const { error: notificationError } = await db.from('notifications').insert({ text });
        if (notificationError) console.error('FOOT26 notification error:', notificationError.message);
      }
      return json(row, 201);
    }

    if (parts.length === 2 && method === 'PUT' && TABLES[parts[0]]) {
      const denied = requireAdmin(); if (denied) return denied;
      const table = parts[0], id = parts[1], body = await readBody(request);
      if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('Le corps doit être un objet JSON.');
      const updates = pick(body, TABLES[table]);
      if (!Object.keys(updates).length) return fail('Aucune modification valide à enregistrer.');
      if (updates.name !== undefined && (typeof updates.name !== 'string' || !updates.name.trim() || updates.name.trim().length > 120)) return fail('Le nom doit contenir entre 1 et 120 caractères.');
      let previousMatch = null;
      if (table === 'matches') {
        const current = await dataOrThrow(db.from('matches').select('home_id,away_id,played,hg,ag').eq('id', id).single());
        previousMatch = current;
        if ((updates.home_id ?? current.home_id) === (updates.away_id ?? current.away_id)) return fail('Une équipe ne peut pas jouer contre elle-même.');
        if ((updates.hg !== undefined && updates.hg < 0) || (updates.ag !== undefined && updates.ag < 0)) return fail('Les scores ne peuvent pas être négatifs.');
      }
      const updated = await dataOrThrow(db.from(table).update(updates).eq('id', id).select().maybeSingle());
      if (!updated) return fail('Élément introuvable.', 404);
      if (table === 'matches' && body.played === true && (!previousMatch?.played || updates.hg !== undefined || updates.ag !== undefined)) {
        const m = await dataOrThrow(db.from('matches').select('hg,ag,home:teams!matches_home_id_fkey(name),away:teams!matches_away_id_fkey(name)').eq('id', id).single());
        await db.from('notifications').insert({ text: `Résultat : ${m.home.name} ${m.hg} - ${m.ag} ${m.away.name}` });
      }
      return json(updated);
    }

    if (parts.length === 2 && method === 'DELETE' && TABLES[parts[0]]) {
      const denied = requireAdmin(); if (denied) return denied;
      await dataOrThrow(db.from(parts[0]).delete().eq('id', parts[1]));
      return json({ ok: true });
    }
    return fail('Route introuvable.', 404);
  } catch (error) {
    const status = Number(error?.status) || 500;
    if (status >= 500) console.error('FOOT26 API error:', error?.message || 'unknown error');
    return fail(status === 503 ? safeError(error) : status >= 500 ? 'Erreur serveur. Vérifiez la configuration et les journaux Cloudflare.' : safeError(error), status);
  }
}
