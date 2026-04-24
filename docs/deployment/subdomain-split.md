# App / Ops Subdomain Deployment

This project now supports a split deployment model:

- `app.example.com` for tenant users
- `ops.example.com` for owner / super-admin access

The frontend detects the active plane from the host name and routes users accordingly.

## Required environment variables

Backend:

```env
APP_ORIGIN="https://app.example.com"
OPS_ORIGIN="https://ops.example.com"
FRONTEND_URLS="https://app.example.com,https://ops.example.com"
```

Frontend:

```env
VITE_APP_ORIGIN="https://app.example.com"
VITE_OPS_ORIGIN="https://ops.example.com"
```

You can copy the baseline from [.env.production.example](../../.env.production.example).

## DNS

Create two DNS records:

- `app.example.com`
- `ops.example.com`

Both may point to the same frontend deployment if you are serving one SPA bundle for both hosts.

## Reverse proxy / CDN behavior

Your proxy should forward both hosts to the same frontend app:

- `app.example.com` -> frontend
- `ops.example.com` -> frontend

The frontend then decides whether to boot the customer plane or the owner plane based on `window.location.hostname`.

API traffic should still reach the backend at `/api/*`.

## Nginx example

```nginx
server {
    listen 80;
    server_name app.example.com ops.example.com;

    root /usr/share/nginx/html;
    index index.html;

    location /api/ {
        proxy_pass http://backend:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

## Google OAuth

Add both app and ops URLs to your Google OAuth configuration:

- `https://app.example.com`
- `https://ops.example.com`

If you later add explicit OAuth redirect URLs, register both planes there too.

## Stripe

Billing success and cancel flows should return to the customer app:

- success -> `https://app.example.com/billing/success`
- cancel -> `https://app.example.com/billing/cancel`

Owner-plane URLs should not be used for customer billing redirects.

## Recommended production posture

- Serve `app` and `ops` on separate subdomains
- Use separate analytics / monitoring labels per host
- Force HTTPS on both hosts
- Restrict owner access with MFA / SSO / IP controls where possible
- Keep all cross-tenant owner actions behind `/api/system/*`
