import { useTranslation } from 'react-i18next';
import { useLanguage } from '../../hooks/useLanguage';

interface Props {
  notes: string;
  onNotesChange: (v: string) => void;
  paymentMethod: string;
  onPaymentMethodChange: (v: string) => void;
}

export default function NotesPaymentCard({
  notes,
  onNotesChange,
  paymentMethod,
  onPaymentMethodChange,
}: Props) {
  const { t } = useTranslation();
  const { isThai } = useLanguage();

  return (
    <div className="card space-y-3">
      <div>
        <h3 className="font-semibold text-gray-900">
          {isThai ? 'หมายเหตุและการชำระเงิน' : 'Notes and payment'}
        </h3>
        <p className="mt-1 text-xs text-gray-500">
          {isThai
            ? 'ส่วนนี้ไม่บังคับ แต่ช่วยให้เอกสารชัดเจนขึ้น เช่น วิธีรับชำระหรือข้อความเพิ่มเติมถึงลูกค้า'
            : 'Optional details that help make the document clearer, such as payment method or extra notes for the customer.'}
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">
            {isThai ? 'วิธีชำระเงิน' : 'Payment Method'}
          </label>
          <select
            value={paymentMethod}
            onChange={(e) => onPaymentMethodChange(e.target.value)}
            className="input-field"
          >
            <option value="">{isThai ? '— ไม่ระบุ —' : '— Not specified —'}</option>
            <option value="cash">{isThai ? 'เงินสด' : 'Cash'}</option>
            <option value="transfer">{isThai ? 'โอนเงิน' : 'Bank Transfer'}</option>
            <option value="cheque">{isThai ? 'เช็ค' : 'Cheque'}</option>
            <option value="credit_card">{isThai ? 'บัตรเครดิต' : 'Credit Card'}</option>
            <option value="other">{isThai ? 'อื่นๆ' : 'Other'}</option>
          </select>
          <p className="mt-1 text-xs text-gray-500">
            {isThai
              ? 'ไม่จำเป็นต้องเลือก ถ้ายังไม่ต้องการแสดงในเอกสาร'
              : 'Optional. Leave blank if you do not want to show a payment method on the document.'}
          </p>
        </div>
        <div>
          <label className="label">{t('invoice.notes')}</label>
          <textarea
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            className="input-field"
            rows={2}
            placeholder={isThai ? 'หมายเหตุเพิ่มเติม...' : 'Additional notes...'}
          />
        </div>
      </div>
    </div>
  );
}
