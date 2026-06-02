# OCR real-sample corpus

Keep real accounting documents local. Never commit customer PDFs, images, OCR
text, tax IDs, or bank details to Git.

## Local folder

Put consented samples in:

```text
backend/private/ocr-real-samples/
```

Use a balanced set: tax invoices, receipts, restaurant receipts, PromptPay or
bank slips, scanned PDFs, digital PDFs, and low-quality mobile photos. Redact
copies when a raw identifier is not needed for the regression.

Generate the local manifest:

```bash
cd backend
npm run ocr:corpus:manifest
```

The ignored manifest records file name, byte size, SHA-256, and empty review
slots. Fill expected classifications and corrected fields in a separate local
review sheet. Promote only anonymized deterministic cases into unit tests such
as `src/services/ocrValidation.test.ts`.

## Audit loop

1. Run each local sample through the intake flow.
2. Record detected type, corrected type, missing fields, provider, confidence,
   latency, and whether a human accepted the result unchanged.
3. Add a redacted unit fixture for every repeatable classification mistake.
4. Review `/api/line/admin/ocr-health` before selling OCR as production-ready.
