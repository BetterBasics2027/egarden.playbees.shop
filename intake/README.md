# Order intake — 3-minute setup (owner)

Order requests from egarden.playbees.shop land in a Google Sheet you own and are
emailed to Zolly. This needs one Apps Script deployed from your Google account.

1. Go to https://sheets.new and name the sheet **eGarden Order Requests**.
2. Menu **Extensions → Apps Script**. Delete the sample code, paste all of `Code.gs`, save (Ctrl+S).
   - Optional: edit `RECIPIENTS` at the top to add your own address next to Zolly's.
3. In the function dropdown pick **selfTest** and click **Run**. Approve the permission
   prompts (Sheets + send email as you). A test row appears in the sheet and Zolly gets
   a test email titled `[eGarden order request] EG-TEST-0001`. Delete the test rows if you like.
4. Click **Deploy → New deployment**. Type: **Web app**. Execute as: **Me**.
   Who has access: **Anyone**. Click **Deploy**, then copy the **Web app URL** (ends in `/exec`).
5. Send me that URL. I paste it into `config.js` (`ORDER_ENDPOINT`) and push; the site starts
   delivering requests within a minute.

Health check: opening the `/exec` URL in a browser shows `{"ok":true,...}`.

Notes
- Rows: sheet **Orders** = one row per request (with a `Status` column you can use for
  follow-up); sheet **Lines** = one row per item for pivoting by product.
- The `Reply-To` on the notification email is the buyer, so replying goes to them.
- To change recipients later: edit `RECIPIENTS`, then **Deploy → Manage deployments → Edit →
  Version: New** so the change goes live (editing the code alone does not update a deployment).
- Until the URL is set, the Send button opens an email draft to Zolly instead; nothing is lost.
