# Food 101

Food 101's existing ordering website, with a protected product dashboard at `/admin` and a branded feedback form at `/#feedback`.

Products are stored in a separate hidden _Food101Products tab of the connected spreadsheet. The dashboard saves changes and uploaded product pictures through server-side Vercel Functions and the shared Google Apps Script bridge. It uses signed, HttpOnly cookies; credentials are never included in public JavaScript. A catalog revision prevents conflicting edits. Customer pages load the latest menu, update gallery/cart items, and recheck prices before sending a WhatsApp order. data/products.json supplies the original 31 products for initial setup and a static display fallback.

Website feedback goes through `/api/feedback` to a Google Apps Script web app, which writes to the existing response sheet (gid `763732222`) in spreadsheet `18j6KNPxLlEoiuBScGOdcopDwFrpwhmNrmC9xSlNx6tI`. The original Google Form remains unchanged. Website responses appear in the linked spreadsheet; they do not appear in Google Forms' own response-count UI.

Feedback pictures are resized in the browser and saved in a **private** Drive folder. The response sheet receives private file links. Up to five JPEG/PNG/WebP pictures may be selected (10 MB each before resizing; 600 KB each after resizing). Product pictures are public, because customers need to see them. Feedback submission references are stored in a hidden sheet so retries do not create duplicate rows. Customer text is written as literal strings, never spreadsheet formulas.

## Local preview and checks

Use Node.js 20 or newer:

```sh
npm test
npm run demo
```

Local demo: `http://localhost:3000/admin`, username `food101`, password `Local-demo-101!`. The demo uses memory only and never writes to Google or GitHub. Its credentials are **not** valid on the live website.

For a configured local server, copy `.env.example` to `.env.local`, set `SITE_ORIGIN=http://localhost:3000`, fill the private settings, and run `npm run dev:configured`.

## Production setup

1. Generate private credentials:

   ```sh
   node scripts/admin-password.mjs /private/path/food101-credentials.json
   ```

2. Set these variables as **Secrets** in the existing Vercel `myfood101` project (production only):

   | Variable | Value |
   |---|---|
   | `ADMIN_PASSWORD_HASH` | Generated hash |
   | `ADMIN_SESSION_SECRET` | Generated session secret |
   | `FEEDBACK_BRIDGE_SECRET` | Generated bridge secret |

   Set Config variables `ADMIN_USERNAME=food101` and `SITE_ORIGIN=https://www.myfood101.org`.

3. Create or open the Google Apps Script project while signed in to `healthy101food@gmail.com`, which must be able to edit the response spreadsheet. Paste `google-apps-script/Code.gs` into `Code.gs`. Enable the manifest in Project Settings and replace `appsscript.json` with the supplied manifest. The explicit scopes are spreadsheets, Drive files created by this app, and external HTTP requests. The script only targets the spreadsheet ID and sheet gid above.

4. In Script Properties, set `BRIDGE_SECRET` to the exact same private value as Vercel's `FEEDBACK_BRIDGE_SECRET`. Do not paste a secret into `Code.gs` or GitHub.

5. Run `prepareFood101Storage` from `healthy101food@gmail.com` to create and verify that account's two upload folders. Then create a **Web app** deployment with **Execute as Me (`healthy101food@gmail.com`)** and access **Anyone**. The endpoint rejects POSTs without the private bridge secret. Google will ask that account to authorize the stated scopes. Uploads check the actual OAuth account and folder ownership before saving. A separate product tab is seeded on the first menu request; uploaded product pictures are public so customers can view them.

6. Set the deployment's `https://script.google.com/macros/s/.../exec` URL as Vercel Config variable `FEEDBACK_BRIDGE_URL`. Use `/exec`, not `/dev`.

7. Deploy the updated `main` branch to the existing Vercel project. Keep the framework preset **Other**; there is no build command. The `/api/*.js` functions deploy alongside the existing static site.

8. Verify sign-in, a reversible menu edit, and a clearly labelled feedback test with a picture. Check that the corresponding row appears in `Form responses 1` and its Drive attachment remains private.

Enable a Vercel Firewall rate limit for `/api/session` and `/api/feedback` appropriate to restaurant traffic. Login attempts are also throttled per server instance; the platform limit adds protection across all instances.

## Maintenance

- Product saves update shared Google storage immediately and do not require a GitHub push or website rebuild. GitHub remains the source for website code.
- Changes to the spreadsheet columns, ID, or response-sheet gid require updating the bridge mapping before redeploying it.
- After editing Apps Script, deploy a new version of the existing web-app deployment so its URL stays the same.
- Changing `ADMIN_SESSION_SECRET` signs out all staff.
- Keep the generated credential file private and out of GitHub. Do not use production secrets in public preview deployments.
- Upload folders use `FOOD101_HEALTHY_PICTURE_FOLDER_ID` and `FOOD101_HEALTHY_PRODUCT_FOLDER_ID`. Legacy folder properties are preserved while the website is switched to the new account's deployment. Transfer existing files individually and accept ownership from the Food101 account; changing the deployment does not transfer existing files or free the old account's storage.
- The secret-protected `storage.check` action returns the actual execution account and the two folder ownership records without adding data.
