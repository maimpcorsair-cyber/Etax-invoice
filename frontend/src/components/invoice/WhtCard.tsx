import { useLanguage } from '../../hooks/useLanguage';
import { Calculator } from 'lucide-react';

interface Props {
  whtRate: string; // "1" | "3" | "5" | ""
  onWhtRateChange: (v: string) => void;
  subtotal: number;
  totalVat: number;
  total: number;
}

export default function WhtCard({ whtRate, onWhtRateChange, total }: Props) {
  const { isThai } = useLanguage();

  const rateNum = parseFloat(whtRate) / 100 || 0;
  const whtAmount = Math.round(total * rateNum * 100) / 100;
  const netAmount = Math.round((total - whtAmount) * 100) / 100;

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2">
        <Calculator className="w-4 h-4 text-red-600" />
        <div>
          <h3 className="font-semibold text-gray-900">
            {isThai ? 'ภาษีหัก ณ ที่จ่าย (50 ทวิ)' : 'Withholding Tax (50 ทวิ)'}
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            {isThai
              ? 'หักภาษี ณ ที่จ่าย ให้ผู้รับเงินได้พึงประเมิน ตามมาตรา 40 แห่งประมวลรัษฎากร'
              : 'WHT for the payer to withhold and remit to the Revenue Department under Section 40 of the Thai Revenue Code.'}
          </p>
        </div>
      </div>

      {/* WHT Rate Selector */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { value: '1', labelTh: '1%', labelEn: '1%', descTh: 'ม.40(1) ค่าจ้าง', descEn: 'Sec.40(1) Wages' },
          { value: '3', labelTh: '3%', labelEn: '3%', descTh: 'ม.40(2) ค่าเช่า/ดอกเบี้ย', descEn: 'Sec.40(2) Rent/Interest' },
          { value: '5', labelTh: '5%', labelEn: '5%', descTh: 'ม.40(4) ค่าบริการ/นายหน้า', descEn: 'Sec.40(4) Service/Brokerage' },
        ].map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onWhtRateChange(whtRate === opt.value ? '' : opt.value)}
            className={`p-3 rounded-lg border-2 text-center transition-all ${
              whtRate === opt.value
                ? 'border-red-500 bg-red-50'
                : 'border-gray-200 hover:border-red-300'
            }`}
          >
            <div className={`text-lg font-bold ${whtRate === opt.value ? 'text-red-600' : 'text-gray-700'}`}>
              {opt.labelTh}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {isThai ? opt.descTh : opt.descEn}
            </div>
          </button>
        ))}
      </div>

      {/* WHT Calculation Preview */}
      {whtRate && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-2">
          <div className="text-xs font-semibold text-red-700 uppercase mb-2">
            {isThai ? 'ตัวอย่างการคำนวณ' : 'Calculation Preview'}
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">{isThai ? 'ยอดรวมวามำ (รวม VAT)' : 'Gross Amount (incl. VAT)'}</span>
            <span className="font-medium">{total.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">
              {isThai ? `ภาษีหัก ณ ที่จ่าย ${whtRate}%` : `Withholding Tax ${whtRate}%`}
            </span>
            <span className="font-medium text-red-600">
              -{whtAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท
            </span>
          </div>
          <div className="border-t border-red-200 pt-2 flex justify-between text-sm font-semibold">
            <span className="text-gray-700">{isThai ? 'ยอดสุทธิหลังหักภาษี' : 'Net after WHT'}</span>
            <span className="text-gray-900">
              {netAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {isThai
              ? 'ระบบจะสร้างใบรับรองหักภาษี (50 ทวิ) อัตโนมัติเมื่อออกเอกสาร'
              : 'A WHT Certificate (50 ทวิ) will be auto-generated when the document is issued.'}
          </p>
        </div>
      )}

      {!whtRate && (
        <p className="text-xs text-gray-400">
          {isThai
            ? 'เลือกอัตราภาษีหัก ณ ที่จ่าย หรือปล่อยว่างหากไม่มีการหักภาษี'
            : 'Select a withholding tax rate, or leave blank if no tax is withheld.'}
        </p>
      )}
    </div>
  );
}