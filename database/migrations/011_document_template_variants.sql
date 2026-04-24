-- Allow multiple selectable template variants per company, document type, and language.
-- The application still keeps only one active default per type/language in route logic.
DROP INDEX IF EXISTS document_templates_company_id_type_language_key;
CREATE INDEX IF NOT EXISTS idx_document_templates_company_type_language
  ON public.document_templates ("companyId", type, language);
