// Shared MSAL token polling snippet for eval.js files.
// Paste this into any eval.js that needs an authenticated session.
// Polls sessionStorage for a valid access token for up to 60s.

const __deadline = Date.now() + 60000;
let token;
while (Date.now() < __deadline) {
  const k = Object.keys(sessionStorage).find(x => x.includes('accesstoken'));
  if (k) {
    try {
      const tokenData = JSON.parse(sessionStorage.getItem(k));
      if (Number(tokenData.expiresOn) > Math.floor(Date.now() / 1000) + 30) {
        token = tokenData.secret;
        break;
      }
    } catch (_) {}
  }
  await new Promise(r => setTimeout(r, 1000));
}
if (!token) throw new Error('No valid MSAL access token after 60s — log in and retry');
