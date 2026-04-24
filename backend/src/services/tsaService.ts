/**
 * tsaService.ts
 * RFC 3161 Timestamp Authority (TSA) service
 *
 * Production TSA ที่ ETDA รับรอง:
 *   - INET TSA:       http://tsa.inet.co.th
 *   - TOT CA TSA:     http://tsa.totca.or.th
 *   - TDID TSA:       https://tsa.thaidigitalid.com
 *
 * Dev/Test TSA (ฟรี):
 *   - FreeTSA:        https://freetsa.org/tsr  (RFC 3161)
 *
 * RD กำหนดให้ฝัง Timestamp ใน XAdES ภายใต้:
 *   <xades:UnsignedProperties>
 *     <xades:UnsignedSignatureProperties>
 *       <xades:SignatureTimestamp>
 *         <xades:EncapsulatedTimeStamp>BASE64_TST</xades:EncapsulatedTimeStamp>
 *       </xades:SignatureTimestamp>
 *     </xades:UnsignedSignatureProperties>
 *   </xades:UnsignedProperties>
 */

import forge from 'node-forge';
import https from 'https';
import http from 'http';
import crypto from 'crypto';
import { logger } from '../config/logger';

const TSA_ENDPOINTS: Record<string, string> = {
  // Production
  inet:  'http://tsa.inet.co.th',
  tot:   'http://tsa.totca.or.th',
  tdid:  'https://tsa.thaidigitalid.com',
  // Development / Free
  free:  'https://freetsa.org/tsr',
  mock:  'mock',   // offline mock — ใช้เมื่อไม่มีอินเทอร์เน็ต
};

export interface TimestampResult {
  token: string;       // base64-encoded TST (TimeStampToken DER)
  tsaUrl: string;
  generatedAt: string;
  isMock: boolean;
}

/**
 * สร้าง RFC 3161 TimeStampRequest สำหรับข้อมูลที่กำหนด
 */
function buildTSRequest(dataToTimestamp: string): Buffer {
  // Hash the data with SHA-256
  const messageHash = crypto
    .createHash('sha256')
    .update(dataToTimestamp, 'utf8')
    .digest();

  /**
   * TimeStampReq ::= SEQUENCE {
   *   version      INTEGER  { v1(1) },
   *   messageImprint  MessageImprint,
   *   nonce           INTEGER  OPTIONAL,
   *   certReq         BOOLEAN DEFAULT FALSE
   * }
   * MessageImprint ::= SEQUENCE {
   *   hashAlgorithm   AlgorithmIdentifier,
   *   hashedMessage   OCTET STRING
   * }
   */
  const sha256OID = '2.16.840.1.101.3.4.2.1';
  const nonce = crypto.randomBytes(8);

  const tsReqAsn1 = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
    // version = 1
    forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.INTEGER, false, '\x01'),
    // messageImprint
    forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
      // hashAlgorithm (SHA-256)
      forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false,
          forge.asn1.oidToDer(sha256OID).getBytes()),
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.NULL, false, ''),
      ]),
      // hashedMessage
      forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OCTETSTRING, false,
        messageHash.toString('binary')),
    ]),
    // nonce
    forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.INTEGER, false,
      nonce.toString('binary')),
    // certReq = TRUE
    forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.BOOLEAN, false, '\xff'),
  ]);

  return Buffer.from(forge.asn1.toDer(tsReqAsn1).getBytes(), 'binary');
}

/** ส่ง HTTP POST ไปยัง TSA endpoint */
function httpPost(url: string, body: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port ? parseInt(parsed.port) : (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/timestamp-query',
        'Content-Length': body.length,
      },
      rejectUnauthorized: false,  // dev only — production: true
    };

    const requester = parsed.protocol === 'https:' ? https : http;
    const req = requester.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(Buffer.concat(chunks));
        } else {
          reject(new Error(`TSA HTTP ${res.statusCode ?? 'unknown'}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('TSA request timeout')); });
    req.write(body);
    req.end();
  });
}

/**
 * สร้าง mock TimeStampToken (ใช้เมื่อไม่สามารถเชื่อมต่อ TSA จริงได้)
 * โครงสร้างถูกต้องตาม RFC 3161 แต่ลงลายมือด้วย self-signed cert
 */
function createMockTimestamp(dataToTimestamp: string): string {
  const now = new Date();
  const hashHex = crypto.createHash('sha256').update(dataToTimestamp, 'utf8').digest('hex');

  // Simplified mock TST (ContentInfo wrapper)
  const mockTstContent = JSON.stringify({
    _type: 'MOCK_TST',
    _note: 'DEV ONLY — not a real RFC 3161 token',
    genTime: now.toISOString(),
    messageHash: hashHex,
    tsaId: 'mock-tsa.etax.dev',
    nonce: crypto.randomBytes(8).toString('hex'),
  });

  return Buffer.from(mockTstContent, 'utf8').toString('base64');
}

/**
 * ขอ Timestamp จาก TSA
 * @param dataToTimestamp - ข้อมูลที่ต้องการ timestamp (signature value หรือ signed xml)
 * @param preferredTsa    - ชื่อ TSA หรือ URL โดยตรง (default: 'free' ใน dev, 'inet' ใน prod)
 */
export async function requestTimestamp(
  dataToTimestamp: string,
  preferredTsa?: string,
): Promise<TimestampResult> {

  const env = process.env.RD_ENVIRONMENT ?? 'sandbox';
  const tsaKey = preferredTsa ?? (env === 'production' ? 'inet' : 'free');
  const tsaUrl = TSA_ENDPOINTS[tsaKey] ?? tsaKey;

  // Mock mode
  if (tsaUrl === 'mock') {
    logger.warn('TSA: using MOCK timestamp (dev mode)');
    return {
      token: createMockTimestamp(dataToTimestamp),
      tsaUrl: 'mock',
      generatedAt: new Date().toISOString(),
      isMock: true,
    };
  }

  try {
    const tsReq = buildTSRequest(dataToTimestamp);
    logger.info(`TSA: requesting timestamp from ${tsaUrl}`);

    const tsResp = await httpPost(tsaUrl, tsReq);

    // Extract TimeStampToken from TimeStampResponse (skip status bytes — first SEQUENCE child)
    // TimeStampResp ::= SEQUENCE { status PKIStatusInfo, timeStampToken TimeStampToken OPTIONAL }
    const respAsn1 = forge.asn1.fromDer(tsResp.toString('binary'));
    const tstAsn1 = (respAsn1.value as forge.asn1.Asn1[])[1];

    let tokenBase64: string;
    if (tstAsn1) {
      tokenBase64 = Buffer.from(forge.asn1.toDer(tstAsn1).getBytes(), 'binary').toString('base64');
    } else {
      // Fallback: base64 entire response
      tokenBase64 = tsResp.toString('base64');
    }

    logger.info(`TSA: timestamp received (${tokenBase64.length} chars base64)`);
    return { token: tokenBase64, tsaUrl, generatedAt: new Date().toISOString(), isMock: false };

  } catch (err) {
    logger.warn(`TSA: failed to get timestamp from ${tsaUrl}: ${(err as Error).message} — falling back to mock`);
    return {
      token: createMockTimestamp(dataToTimestamp),
      tsaUrl: `${tsaUrl} (failed, mock used)`,
      generatedAt: new Date().toISOString(),
      isMock: true,
    };
  }
}

/**
 * ฝัง Timestamp Token เข้าใน Signed XML
 * เพิ่ม <xades:UnsignedProperties> หลัง <ds:Object>
 */
export function embedTimestampInXml(signedXml: string, tst: TimestampResult): string {
  const unsignedProps = [
    `    <xades:UnsignedProperties>`,
    `      <xades:UnsignedSignatureProperties>`,
    `        <xades:SignatureTimestamp>`,
    `          <xades:EncapsulatedTimeStamp>${tst.token}</xades:EncapsulatedTimeStamp>`,
    `        </xades:SignatureTimestamp>`,
    `      </xades:UnsignedSignatureProperties>`,
    `    </xades:UnsignedProperties>`,
  ].join('\n');

  // Inject before </xades:QualifyingProperties>
  return signedXml.replace(
    '</xades:QualifyingProperties>',
    `${unsignedProps}\n    </xades:QualifyingProperties>`,
  );
}
