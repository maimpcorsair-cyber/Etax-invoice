import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CreditCard } from 'lucide-react';

export default function BillingCancel() {
  const { i18n } = useTranslation();
  const isThai = i18n.language === 'th';

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef4ff_100%)] flex items-center justify-center px-4">
      <div className="w-full max-w-xl rounded-[28px] border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 text-amber-700">
          <CreditCard className="w-8 h-8" />
        </div>
        <h1 className="text-center text-3xl font-bold text-gray-900">
          {isThai ? 'ยกเลิกการชำระเงิน' : 'Checkout canceled'}
        </h1>
        <p className="mt-3 text-center text-gray-600">
          {isThai
            ? 'ยังไม่มีการตัดเงิน คุณสามารถกลับไปเลือกแพ็กเกจและเริ่มชำระใหม่ได้ทุกเมื่อ'
            : 'No charge was made. You can return to pricing and start checkout again any time.'}
        </p>

        <div className="mt-8 flex flex-col sm:flex-row gap-3">
          <Link to="/#pricing-checkout" className="btn-primary lg justify-center flex-1">
            {isThai ? 'กลับไปเลือกแพ็กเกจ' : 'Back to pricing'}
          </Link>
          <Link to="/" className="btn-secondary lg justify-center flex-1">
            <ArrowLeft className="w-5 h-5" />
            {isThai ? 'กลับหน้าแรก' : 'Home'}
          </Link>
        </div>
      </div>
    </div>
  );
}
