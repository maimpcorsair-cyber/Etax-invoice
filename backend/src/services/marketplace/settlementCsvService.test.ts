import test from 'node:test';
import assert from 'node:assert/strict';
import {
  guessSettlementMapping,
  parseMoney,
  parseSettlementCsv,
  parseSettlementDate,
} from './settlementCsvService';

function localYmd(date: Date | null | undefined) {
  assert.ok(date);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

test('settlement CSV parser maps gross fee refund adjustment and net rows', () => {
  const csv = [
    'Order ID,Settlement Date,Gross Sales,Platform Fee,Refund,Adjustment,Net Payout',
    'SPX-1,02/06/2569,"1,000.00",50,20,5,935',
    'SPX-2,2026-06-03,500,(25),0,0,475',
    ',2026-06-04,999,1,1,0,997',
  ].join('\n');

  const rows = parseSettlementCsv(Buffer.from(csv), {
    externalRef: 'Order ID',
    settledAt: 'Settlement Date',
    gross: 'Gross Sales',
    fee: 'Platform Fee',
    refund: 'Refund',
    adjustment: 'Adjustment',
    net: 'Net Payout',
  });

  assert.equal(rows.length, 2);
  assert.equal(rows[0].externalRef, 'SPX-1');
  assert.equal(rows[0].gross, 1000);
  assert.equal(rows[0].fee, 50);
  assert.equal(rows[0].refund, 20);
  assert.equal(rows[0].adjustment, 5);
  assert.equal(rows[0].net, 935);
  assert.equal(localYmd(rows[0].settledAt), '2026-06-02');
  assert.equal(rows[1].fee, 25);
});

test('settlement CSV parser computes net when the payout file has no net column', () => {
  const csv = [
    'Reference,Gross,Fee,Refund,Adjustment',
    'TX-1,1000,100,50,-10',
  ].join('\n');

  const rows = parseSettlementCsv(Buffer.from(csv), {
    externalRef: 'Reference',
    gross: 'Gross',
    fee: 'Fee',
    refund: 'Refund',
    adjustment: 'Adjustment',
  });

  assert.equal(rows[0].net, 840);
});

test('settlement mapping guesses common marketplace payout headers', () => {
  const mapping = guessSettlementMapping(['Transaction ID', 'Payout Date', 'Sales Amount', 'Commission Fee', 'Refund', 'Net Amount']);

  assert.equal(mapping.externalRef, 'Transaction ID');
  assert.equal(mapping.settledAt, 'Payout Date');
  assert.equal(mapping.gross, 'Sales Amount');
  assert.equal(mapping.fee, 'Commission Fee');
  assert.equal(mapping.refund, 'Refund');
  assert.equal(mapping.net, 'Net Amount');
});

test('settlement money and date parsing handles payout export formats', () => {
  assert.equal(parseMoney('(1,234.50)'), -1234.5);
  assert.equal(parseMoney('฿ 1,234.50'), 1234.5);
  assert.equal(localYmd(parseSettlementDate('03/06/2569')), '2026-06-03');
});
