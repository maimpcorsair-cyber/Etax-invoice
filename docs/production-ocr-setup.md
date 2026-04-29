# Production OCR setup

Use this setup when the LINE document reader is sold to real customers.

## Required Render environment variables

```bash
AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT=https://<your-resource>.cognitiveservices.azure.com
AZURE_DOCUMENT_INTELLIGENCE_KEY=<secret>
AZURE_DOCUMENT_INTELLIGENCE_MODEL_ID=prebuilt-invoice
AZURE_DOCUMENT_INTELLIGENCE_API_VERSION=2024-11-30
AZURE_DOCUMENT_INTELLIGENCE_TIMEOUT_MS=45000

GOOGLE_AI_API_KEY=<secret>
GOOGLE_AI_OCR_FAST_MODEL=gemini-2.5-flash-lite
GOOGLE_AI_OCR_SCAN_MODEL=gemini-2.5-flash
GOOGLE_AI_OCR_PRO_VERIFY_MODEL=gemini-2.5-pro
AI_OCR_PRO_VERIFY_ENABLED=true
AI_OCR_TIMEOUT_MS=45000
```

Keep `OPENROUTER_API_KEY` only as a fallback. Do not use free fallback models as the main production OCR path.

## Production routing

1. Text PDF: extract text with `pdf-parse`, then verify with Gemini Flash-Lite.
2. Image/scanned PDF: run Azure Document Intelligence prebuilt invoice first.
3. Gemini Flash verifies document type, fields, totals, and Thai/English text.
4. Gemini Pro runs only when confidence is low, the document has multiple pages, required fields are missing, or totals/tax validation fails.
5. Business rules run after OCR: VAT arithmetic, Thai tax ID checksum, duplicate invoice number, bank slip reclassification, vendor memory.
6. LINE asks for missing fields and shows a summary before saving.

## Health check

After deploying, call:

```text
GET /api/line/admin/ocr-health
```

The response includes `productionReadiness.productionReady`. It should be `true` before selling OCR as a production feature.

## Package cost control

Recommended starting policy:

- Starter: include 100 OCR documents/month.
- Business: include 500 OCR documents/month.
- Overage: charge 1-3 THB/document.
- Multi-page or Pro-escalated documents may consume extra OCR credits.

This keeps most documents on the cheap path while reserving the expensive model for risky cases.
