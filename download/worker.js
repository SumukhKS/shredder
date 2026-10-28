// Download link for the Android app: https://shredder.shredderfit.workers.dev/Shredder.apk
// Streams the latest EAS build so the file saves as Shredder.apk instead of Expo's
// "application-<id>.apk". After each new APK build, point LATEST_APK at its artifact URL.
const LATEST_APK = 'https://expo.dev/artifacts/eas/f2cXkNLJPk3q4IAhVsALUk2-B6NyQfQ4EHtFaCxujY8.apk';

export default {
  async fetch(request) {
    const url = new URL(request.url);
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
