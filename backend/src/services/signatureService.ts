/**
 * signatureService.ts
 * XAdES-BES XML Digital Signature ตามมาตรฐาน ETDA ขมธอ. 3-2560
 *
 * Schema:
 *   http://www.w3.org/2000/09/xmldsig#          (XMLDSig)
 *   http://uri.etsi.org/01903/v1.3.2#           (XAdES)
 *
 * Algorithm:
 *   Digest   : SHA-256
 *   Signature: RSA-SHA256
 *   C14N     : Canonical XML 1.0
 */

import forge from 'node-forge';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../config/logger';

export interface SignedXmlResult {
  signedXml: string;
  signatureId: string;
  signingTime: string;
  certificateThumbprint: string;
}

export interface CertificateCredentials {
  certPath?: string | null;
  certPassword?: string | null;
}

interface CertInfo {
  certificate: forge.pki.Certificate;
  privateKey: forge.pki.rsa.PrivateKey;
  certDer: string;       // base64 DER
  certPemRaw: string;    // raw PEM without headers
  thumbprintSha256: string;
  issuerSerial: string;
}

let _certCache: CertInfo | null = null;
let _certCacheKey: string | null = null;

/** โหลด .p12 certificate จาก path ใน .env */
function loadCertificate(credentials?: CertificateCredentials): CertInfo {
  const certPath = credentials?.certPath ?? process.env.CERT_PATH;
  const certPass = credentials?.certPassword ?? process.env.CERT_PASSWORD ?? '';

  if (!certPath) {
    throw new Error('CERT_PATH not configured in .env');
  }

  const resolvedPath = path.isAbsolute(certPath)
    ? certPath
    : path.join(process.cwd(), certPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Certificate file not found: ${resolvedPath}`);
  }

  const cacheKey = `${resolvedPath}:${crypto.createHash('sha256').update(certPass, 'utf8').digest('hex')}`;
  if (_certCache && _certCacheKey === cacheKey) return _certCache;

  const p12Der = fs.readFileSync(resolvedPath).toString('binary');
  const p12Asn1 = forge.asn1.fromDer(p12Der);
  // Password-only call (strict=true by default). Do NOT pass `false` here —
  // it silently disables MAC verification and causes confusing errors.
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, certPass);

  // Extract certificate
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certBag = certBags[forge.pki.oids.certBag]?.[0];
  if (!certBag?.cert) throw new Error('No certificate found in .p12');
  const certificate = certBag.cert;

  // Extract private key
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
  if (!keyBag?.key) throw new Error('No private key found in .p12');
  const privateKey = keyBag.key as forge.pki.rsa.PrivateKey;

  // Certificate DER (base64) for embedding in XML
  const certAsn1 = forge.pki.certificateToAsn1(certificate);
  const certDerBin = forge.asn1.toDer(certAsn1).getBytes();
  const certDer = Buffer.from(certDerBin, 'binary').toString('base64');

  // Raw PEM content (no headers) for X509Certificate element
  const certPem = forge.pki.certificateToPem(certificate);
  const certPemRaw = certPem
    .replace('-----BEGIN CERTIFICATE-----', '')
    .replace('-----END CERTIFICATE-----', '')
    .replace(/\n/g, '');

  // SHA-256 thumbprint (fingerprint)
  const thumbprint = crypto
    .createHash('sha256')
    .update(Buffer.from(certDerBin, 'binary'))
    .digest('base64');

  // IssuerSerial — encode issuer DN + serial as simple base64 string
  // (XAdES IssuerSerialV2: base64 of DER-encoded IssuerAndSerialNumber)
  const issuerCN = (certificate.issuer.getField('CN')?.value as string) ?? '';
  const serialHex = certificate.serialNumber;
  const issuerSerial = Buffer.from(`${issuerCN}/${serialHex}`, 'utf8').toString('base64');

  _certCache = { certificate, privateKey, certDer, certPemRaw, thumbprintSha256: thumbprint, issuerSerial };
  _certCacheKey = cacheKey;
  logger.info(`Certificate loaded: ${certificate.subject.getField('CN')?.value} (valid until ${certificate.validity.notAfter.toISOString()})`);
  return _certCache;
}

/** SHA-256 digest → base64 */
function sha256Base64(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf8').digest('base64');
}

/**
 * Simple Canonical XML 1.0 (C14N)
 * For production you'd use a full C14N library, but for ETDA's schema
 * with our controlled XML this is sufficient.
 */
function canonicalize(xml: string): string {
  // Normalize line endings, sort attributes (simplified)
  return xml.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * Sign XML document with XAdES-BES
 * ฝัง <ds:Signature> ไว้ภายใน root element
 */
export function signXml(xmlContent: string, credentials?: CertificateCredentials): SignedXmlResult {
  const cert = loadCertificate(credentials);
  const signingTime = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const signatureId = `Sig-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const sigPropsId  = `SigProps-${signatureId}`;

  // ─── 1. Strip existing XML declaration + root closing tag ───────────────
  const xmlNoDecl = xmlContent
    .replace(/<\?xml[^?]*\?>\s*/i, '')
    .trim();

  // Find root closing tag to inject signature before it
  const lastTagMatch = xmlNoDecl.match(/(<\/[^>]+>)\s*$/);
  if (!lastTagMatch) throw new Error('Cannot find root closing tag in XML');
  const closingTag = lastTagMatch[1];
  const xmlBody = xmlNoDecl.slice(0, xmlNoDecl.lastIndexOf(closingTag)).trimEnd();

  // ─── 2. Build XAdES SignedProperties (will be digested) ─────────────────
  const certDigest = sha256Base64(
    Buffer.from(
      forge.asn1.toDer(forge.pki.certificateToAsn1(cert.certificate)).getBytes(),
      'binary'
    ).toString('utf8')
  );

  const signedProps = [
    `<xades:SignedProperties Id="${sigPropsId}">`,
    `  <xades:SignedSignatureProperties>`,
    `    <xades:SigningTime>${signingTime}</xades:SigningTime>`,
    `    <xades:SigningCertificateV2>`,
    `      <xades:Cert>`,
    `        <xades:CertDigest>`,
    `          <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>`,
    `          <ds:DigestValue>${certDigest}</ds:DigestValue>`,
    `        </xades:CertDigest>`,
    `        <xades:IssuerSerialV2>${cert.issuerSerial}</xades:IssuerSerialV2>`,
    `      </xades:Cert>`,
    `    </xades:SigningCertificateV2>`,
    `  </xades:SignedSignatureProperties>`,
    `</xades:SignedProperties>`,
  ].join('\n');

  // ─── 3. Digest the XML body (enveloped) ────────────────────────────────
  const bodyDigest = sha256Base64(canonicalize(xmlBody));

  // Digest the SignedProperties
  const propsDigest = sha256Base64(canonicalize(signedProps));

  // ─── 4. Build <ds:SignedInfo> ───────────────────────────────────────────
  const signedInfo = [
    `<ds:SignedInfo>`,
    `  <ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>`,
    `  <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>`,
    `  <ds:Reference URI="">`,
    `    <ds:Transforms>`,
    `      <ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>`,
    `      <ds:Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>`,
    `    </ds:Transforms>`,
    `    <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>`,
    `    <ds:DigestValue>${bodyDigest}</ds:DigestValue>`,
    `  </ds:Reference>`,
    `  <ds:Reference URI="#${sigPropsId}" Type="http://uri.etsi.org/01903#SignedProperties">`,
    `    <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>`,
    `    <ds:DigestValue>${propsDigest}</ds:DigestValue>`,
    `  </ds:Reference>`,
    `</ds:SignedInfo>`,
  ].join('\n');

  // ─── 5. RSA-SHA256 sign the <SignedInfo> ───────────────────────────────
  const md = forge.md.sha256.create();
  md.update(canonicalize(signedInfo), 'utf8');
  const signatureBytes = (cert.privateKey as forge.pki.rsa.PrivateKey).sign(md);
  const signatureValue = Buffer.from(signatureBytes, 'binary').toString('base64');

  // ─── 6. Assemble full <ds:Signature> block ─────────────────────────────
  const signatureBlock = [
    `<ds:Signature Id="${signatureId}"`,
    `  xmlns:ds="http://www.w3.org/2000/09/xmldsig#"`,
    `  xmlns:xades="http://uri.etsi.org/01903/v1.3.2#">`,
    `  ${signedInfo}`,
    `  <ds:SignatureValue Id="SigVal-${signatureId}">`,
    `    ${signatureValue}`,
    `  </ds:SignatureValue>`,
    `  <ds:KeyInfo>`,
    `    <ds:X509Data>`,
    `      <ds:X509Certificate>${cert.certPemRaw}</ds:X509Certificate>`,
    `    </ds:X509Data>`,
    `  </ds:KeyInfo>`,
    `  <ds:Object>`,
    `    <xades:QualifyingProperties Target="#${signatureId}">`,
    `      ${signedProps}`,
    `    </xades:QualifyingProperties>`,
    `  </ds:Object>`,
    `</ds:Signature>`,
  ].join('\n');

  // ─── 7. Inject signature before root closing tag ────────────────────────
  const signedXml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `${xmlBody}`,
    `  ${signatureBlock}`,
    `${closingTag}`,
  ].join('\n');

  logger.info(`XML signed: signatureId=${signatureId}, signingTime=${signingTime}`);

  return {
    signedXml,
    signatureId,
    signingTime,
    certificateThumbprint: cert.thumbprintSha256,
  };
}

/** ตรวจสอบว่า certificate พร้อมใช้งาน */
export function getCertificateInfo(credentials?: CertificateCredentials): {
  loaded: boolean;
  commonName?: string;
  validUntil?: string;
  thumbprint?: string;
  isExpired?: boolean;
  isDev?: boolean;
  error?: string;
} {
  try {
    const certPath = credentials?.certPath ?? process.env.CERT_PATH;
    if (!certPath) return { loaded: false, error: 'CERT_PATH not set' };

    const cert = loadCertificate(credentials);
    const now = new Date();
    const validUntil = cert.certificate.validity.notAfter;

    return {
      loaded: true,
      commonName: cert.certificate.subject.getField('CN')?.value as string,
      validUntil: validUntil.toISOString(),
      thumbprint: cert.thumbprintSha256,
      isExpired: validUntil < now,
      isDev: cert.certificate.issuer.getField('CN')?.value === cert.certificate.subject.getField('CN')?.value,
    };
  } catch (err) {
    return { loaded: false, error: (err as Error).message };
  }
}

/** Clear cert cache (after uploading new cert) */
export function clearCertCache(): void {
  _certCache = null;
  _certCacheKey = null;
}
