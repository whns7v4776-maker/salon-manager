import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Content-Type': 'application/json' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const cache = new Map<string, { time: number; results: unknown[] }>();
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return reply({ error: 'Metodo non consentito.' }, 405);
  const owner = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: request.headers.get('authorization') || '' } }, auth: { persistSession: false } });
  const { data: { user }, error } = await owner.auth.getUser();
  if (error || !user) return reply({ error: 'Accedi nuovamente.' }, 401);
  const workspace = await owner.rpc('current_workspace_id');
  const access = await owner.rpc('workspace_access_allowed');
  if (workspace.error || !workspace.data || access.error || !access.data) return reply({ error: 'Accesso non disponibile.' }, 403);
  try {
    const body = await request.json();
    if (typeof body.address !== 'string' || typeof body.city !== 'string' || body.address.trim().length < 3 || body.address.length > 180 || body.city.trim().length < 2 || body.city.length > 100) return reply({ error: 'Inserisci via, numero civico e città.' }, 400);
    const city = body.city.replace(/\([^)]*\)/g, '').trim();
    const query = `${body.address.trim()}, ${city}, Italia`;
    const hit = cache.get(query.toLowerCase());
    if (hit && Date.now() - hit.time < 86400000) return reply({ results: hit.results });
    // Endpoint is remotely replaceable; searches only run on an explicit owner action.
    const url = new URL(Deno.env.get('SALON_GEOCODER_URL') || 'https://photon.komoot.io/api/');
    url.searchParams.set('q', query); url.searchParams.set('limit', '5');
    const response = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'SalonPro/1.0 (https://salonpro.dev)' } });
    if (!response.ok) throw new Error('provider');
    const data = await response.json();
    const results = (data.features || []).flatMap((f: any) => {
      const p = f.properties || {}; const [longitude, latitude] = f.geometry?.coordinates || [];
      // Never suggest a city/region centroid as a salon location.
      const compact = (value: string) => value.toLowerCase().replace(/[^a-zà-ÿ]/g, '');
      const town = p.city || p.town || p.village || '';
      const matchesCity = [town, p.district, p.locality].filter(Boolean).some((value: string) => compact(city).includes(compact(value)));
      const street = p.street || (p.type === 'street' ? p.name : '');
      if (!matchesCity || p.countrycode?.toUpperCase() !== 'IT' || !street || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return [];
      return [{ latitude, longitude, label: [p.type === 'street' ? null : p.name, [street, p.housenumber].filter(Boolean).join(' '), p.postcode, p.city || p.town || p.village].filter(Boolean).join(', '), approximate: !p.housenumber }];
    }).slice(0, 5);
    if (cache.size >= 200) cache.delete(cache.keys().next().value!);
    cache.set(query.toLowerCase(), { time: Date.now(), results });
    return reply({ results });
  } catch { return reply({ error: 'Ricerca indirizzo non disponibile. Riprova oppure usa la posizione dalla sede.' }, 503); }
});
