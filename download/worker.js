// Download link for the Android app: https://shredder.shredderfit.workers.dev/Shredder.apk
// Streams the latest EAS build so the file saves as Shredder.apk instead of Expo's
// "application-<id>.apk". After each new APK build, point LATEST_APK at its artifact URL.
const LATEST_APK = 'https://expo.dev/artifacts/eas/f2cXkNLJPk3q4IAhVsALUk2-B6NyQfQ4EHtFaCxujY8.apk';

const escapeHtml = (text) =>
  String(text ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

const page = (body, status = 200) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Shredder</title><style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#000;color:#fff;font-family:system-ui,sans-serif;padding:16px;box-sizing:border-box}
main{width:100%;max-width:420px;text-align:center}
img,.letter{width:112px;height:112px;border-radius:56px;object-fit:cover;background:#1c1c1e;display:inline-flex;align-items:center;justify-content:center;font-size:48px;color:#ff5a1f}
h1{font-size:28px;margin:16px 0 8px}p{color:#a1a1aa;line-height:1.5;margin:0 0 16px;overflow-wrap:anywhere}
.stats{display:flex;gap:12px;margin:24px 0}.stats div{flex:1;background:#1c1c1e;border-radius:16px;padding:16px}.stats b{display:block;font-size:28px}.stats span{color:#a1a1aa;font-size:14px}
a.get{display:block;background:#ff5a1f;color:#000;font-weight:700;text-decoration:none;padding:16px;border-radius:16px}small{display:block;color:#a1a1aa;margin-top:12px}
</style></head><body><main>${body}</main></body></html>`,
    {
      status,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': status === 200 ? 'public, max-age=300' : 'no-store',
        'x-robots-tag': 'noindex',
      },
    }
  );

const DOWNLOAD = '<a class="get" href="/Shredder.apk">Download Shredder</a><small>Android only for now.</small>';

/** A shared profile: only what the public_profile function returns. */
async function profilePage(shareId, env) {
  const notFound = page(`<h1>Profile not found</h1><p>This link may be out of date.</p>${DOWNLOAD}`);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(shareId)) return notFound;
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/public_profile`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: env.SUPABASE_PUBLISHABLE_KEY },
    body: JSON.stringify({ p_share: shareId }),
  });
  if (!res.ok) return page(`<h1>Something went wrong</h1><p>This profile can't be shown right now. Try again soon.</p>${DOWNLOAD}`, 502);
  const p = await res.json();
  if (!p) return notFound;
  const name = p.name || 'Athlete';
  const avatar = /^https:\/\//.test(p.avatar_url ?? '')
    ? `<img src="${escapeHtml(p.avatar_url)}" alt="">`
    : `<div class="letter">${escapeHtml(name[0].toUpperCase())}</div>`;
  return page(`${avatar}<h1>${escapeHtml(name)}</h1>${p.bio ? `<p>${escapeHtml(p.bio)}</p>` : ''}
<div class="stats"><div><b>${Number(p.workouts).toLocaleString('en')}</b><span>Workouts</span></div><div><b>${Number(p.week_streak).toLocaleString('en')}</b><span>Week streak</span></div></div>
<p>Track your training and food with Shredder.</p>${DOWNLOAD}`);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const shared = url.pathname.match(/^\/u\/([^/]+)$/);
    if (shared) return profilePage(shared[1], env);
    if (url.pathname !== '/Shredder.apk') {
      return Response.redirect(url.origin + '/Shredder.apk', 302);
    }
    const upstream = await fetch(LATEST_APK);
    if (!upstream.ok) return new Response('The download is not available right now.', { status: 502 });
    const headers = new Headers({
      'content-type': 'application/vnd.android.package-archive',
      'content-disposition': 'attachment; filename="Shredder.apk"',
      'cache-control': 'no-store',
    });
    const length = upstream.headers.get('content-length');
    if (length) headers.set('content-length', length);
    return new Response(upstream.body, { headers });
  },
};
