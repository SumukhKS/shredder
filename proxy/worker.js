// Forwards every request to the Supabase project, so the app reaches Supabase through
// workers.dev on networks that block *.supabase.co (several Indian ISPs and mobile carriers).
// It also serves the pages the sign-up email links to: /confirm-email and /confirmed.
const UPSTREAM = 'https://nsclphbkzesbhzniignm.supabase.co';
// The publishable key is public (it ships in the app); /confirm-email needs it to call /auth/v1/verify.
const PUBLISHABLE_KEY = 'sb_publishable_8JpkVkwl8indMXRbaex41w_ZuDo7zLz';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/confirmed') {
      return new Response(CONFIRMED_PAGE, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
    if (url.pathname === '/confirm-email') {
      return new Response(CONFIRM_EMAIL_PAGE.replace('__PUBLISHABLE_KEY__', PUBLISHABLE_KEY), {
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
      });
    }
    const target = UPSTREAM + url.pathname + url.search;
    // Realtime websockets pass straight through.
    if (request.headers.get('Upgrade') === 'websocket') return fetch(target, request);
    return fetch(new Request(target, request), { redirect: 'manual' });
  },
};

// Supabase redirects here with the new session (or an error) in the URL fragment. The page
// hands the session to the app through its shredder:// link, which signs the person in.
const CONFIRMED_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Shredder</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #000; color: #fff;
         font: 16px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
  main { max-width: 360px; padding: 32px 24px; text-align: center; }
  .badge { width: 72px; height: 72px; margin: 0 auto 20px; border-radius: 22px; display: grid; place-items: center;
           font-size: 36px; background: linear-gradient(135deg, #FFA043, #FF5A1F 55%, #E6301A);
           box-shadow: 0 0 32px rgba(255, 90, 31, 0.45); color: #000; }
  h1 { margin: 0 0 8px; font-size: 26px; }
  p { margin: 0 0 24px; color: #A99E97; }
  a.button { display: block; padding: 16px; border-radius: 14px; font-weight: 700; text-decoration: none; color: #000;
             background: linear-gradient(135deg, #FFA043, #FF5A1F 55%, #E6301A); }
  .error .badge { background: #211814; color: #FF5A1F; box-shadow: none; }
</style>
</head>
<body>
<main id="main">
  <div class="badge">&#10003;</div>
  <h1 id="title">Email confirmed</h1>
  <p id="text">Your Shredder account is ready. Opening the app...</p>
  <a class="button" id="open" href="shredder://">Open Shredder</a>
</main>
<script>
  var hash = location.hash.slice(1);
  var params = new URLSearchParams(hash || location.search.slice(1));
  var open = document.getElementById('open');
  if (params.get('error') || params.get('error_description')) {
    document.getElementById('main').className = 'error';
    document.querySelector('.badge').textContent = '!';
    document.getElementById('title').textContent = 'Link did not work';
    document.getElementById('text').textContent =
      (params.get('error_description') || 'This link has expired or was already used.').replace(/\\+/g, ' ') +
      ' Open Shredder and sign in, or tap "Resend email" to get a new link.';
  } else if (params.get('access_token') && params.get('refresh_token')) {
    open.href = 'shredder://auth-callback#' + hash;
    setTimeout(function () { location.href = open.href; }, 600);
  } else {
    document.getElementById('text').textContent = 'Your email is confirmed. Open Shredder and sign in.';
  }
</script>
</body>
</html>`;

// The sign-up email links here instead of straight to /auth/v1/verify. Mail scanners (Gmail's
// included) open links before the person does, and a GET to /verify would use up the one-time
// token. Nothing is verified until the button is pressed, which scanners don't do.
const CONFIRM_EMAIL_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Shredder</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #000; color: #fff;
         font: 16px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
  main { max-width: 360px; padding: 32px 24px; text-align: center; }
  .badge { width: 72px; height: 72px; margin: 0 auto 20px; border-radius: 22px; display: grid; place-items: center;
           font-size: 36px; background: linear-gradient(135deg, #FFA043, #FF5A1F 55%, #E6301A);
           box-shadow: 0 0 32px rgba(255, 90, 31, 0.45); color: #000; }
  h1 { margin: 0 0 8px; font-size: 26px; }
  p { margin: 0 0 24px; color: #A99E97; }
  .button { display: block; width: 100%; padding: 16px; border: 0; border-radius: 14px; font: inherit; font-weight: 700;
            text-decoration: none; color: #000; cursor: pointer;
            background: linear-gradient(135deg, #FFA043, #FF5A1F 55%, #E6301A); }
  .button[disabled] { opacity: 0.6; }
  .error .badge { background: #211814; color: #FF5A1F; box-shadow: none; }
</style>
</head>
<body>
<main id="main">
  <div class="badge" id="badge">&#9993;</div>
  <h1 id="title">Confirm your email</h1>
  <p id="text">Tap the button to confirm your Shredder account.</p>
  <button class="button" id="go">Confirm my email</button>
</main>
<script>
  var query = new URLSearchParams(location.search);
  var tokenHash = query.get('token_hash');
  var go = document.getElementById('go');
  var link = null;

  function show(title, text, failed) {
    document.getElementById('title').textContent = title;
    document.getElementById('text').textContent = text;
    if (failed) {
      document.getElementById('main').className = 'error';
      document.getElementById('badge').textContent = '!';
    } else {
      document.getElementById('badge').innerHTML = '&#10003;';
    }
  }

  function verify(type) {
    return fetch('/auth/v1/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: '__PUBLISHABLE_KEY__' },
      body: JSON.stringify({ type: type, token_hash: tokenHash }),
    }).then(function (res) {
      return res.json().then(function (body) { return { ok: res.ok, body: body }; });
    });
  }

  if (!tokenHash) {
    show('Link did not work', 'This link is incomplete. Open Shredder and tap "Resend email" to get a new one.', true);
    go.style.display = 'none';
  }

  go.addEventListener('click', function () {
    if (link) { location.href = link; return; }
    go.disabled = true;
    go.textContent = 'Confirming...';
    verify('email')
      .then(function (r) { return r.ok ? r : verify('signup'); })
      .then(function (r) {
        if (r.ok && r.body.access_token && r.body.refresh_token) {
          link = 'shredder://auth-callback#access_token=' + encodeURIComponent(r.body.access_token) +
            '&refresh_token=' + encodeURIComponent(r.body.refresh_token);
          show('Email confirmed', 'Your Shredder account is ready. Opening the app...');
          go.disabled = false;
          go.textContent = 'Open Shredder';
          setTimeout(function () { location.href = link; }, 600);
        } else {
          go.style.display = 'none';
          show('Link did not work',
            (r.body.msg || r.body.error_description || 'This link has expired or was already used.') +
            ' Open Shredder and sign in, or tap "Resend email" to get a new link.', true);
        }
      })
      .catch(function () {
        go.disabled = false;
        go.textContent = 'Try again';
        show('No connection', 'Check your internet connection and tap Try again.', true);
      });
  });
</script>
</body>
</html>`;
