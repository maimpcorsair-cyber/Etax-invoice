# Google Drive Setup

Billboy uses two Google Drive modes.

1. Service account Drive: project folders, document uploads, and Google Sheet exports can run without each user linking a personal Drive.
2. User OAuth Drive: a logged-in user can click "Connect my Drive" so files land in that user's Google Drive.

## Render Environment Variables

Set these on the backend service:

```env
GOOGLE_CLIENT_ID=your-google-web-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-web-client-secret
GOOGLE_DRIVE_REDIRECT_URI=https://etax-invoice-api.onrender.com/api/drive/callback
FRONTEND_URLS=https://etax-invoice.vercel.app
```

For service-account project folders and Google Sheets export, set one of:

```env
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"..."}
```

or:

```env
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

## Google Cloud Console

Create or open a Google Cloud project, enable Google Drive API and Google Sheets API, then create an OAuth client of type Web application.

Add this Authorized redirect URI:

```text
https://etax-invoice-api.onrender.com/api/drive/callback
```

After Render redeploys, check `/api/drive/status` while logged in. It should show `oauthConfigured: true` for the personal Drive connect button, and `serviceAccountConfigured: true` for project folder sync without user OAuth.
