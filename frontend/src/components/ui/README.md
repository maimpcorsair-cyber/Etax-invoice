# Billoy Product UI Style Guide

This folder contains the shared product UI primitives for the premium SaaS redesign.

## Direction

- Light, polished Thai finance workspace with navy, teal, and restrained gold accents.
- Soft mesh backgrounds and subtle grid texture for depth.
- Mascot appears as a helpful assistant in high-signal states: dashboard hero, upload/review, settings tips, empty states, waiting/error/success moments.
- Cards, tables, inputs, and buttons use global classes from `src/index.css` so legacy pages inherit the new system.

## Core Components

- `PageHeader`: page-level hero/header with optional actions and mascot panel.
- `MetricCard`: KPI card for dashboards, summaries, and status counts.
- `EmptyState`: reusable no-data/waiting/error/success shell with mascot art.
- `MascotHelperCard`: compact tip or helper widget for onboarding and settings.

## Assets

- `/brand/billoy-hero-mascot.jpg`: hero mascot used in landing/auth/dashboard.
- `/brand/mascot/billoy-product-poses.jpg`: product pose sheet used for helper, empty, scan, approval, and workflow states.

Keep future mascot files under `frontend/public/brand/mascot/` using names like:

- `billoy-waving.jpg`
- `billoy-receipt.jpg`
- `billoy-scan-phone.jpg`
- `billoy-analytics.jpg`
- `billoy-success.jpg`
- `billoy-empty-state.jpg`
- `billoy-warning.jpg`
- `billoy-approval.jpg`
- `billoy-support.jpg`
