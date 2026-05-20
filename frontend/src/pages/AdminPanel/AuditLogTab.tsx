import { Link } from 'react-router-dom';
import { ScrollText } from 'lucide-react';

export default function AuditLogTab({ isThai }: { isThai: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-gray-400">
      <ScrollText className="w-10 h-10" />
      <p className="text-sm">
        {isThai ? 'Audit Log จะแสดงที่นี่' : 'Audit log will be displayed here.'}
      </p>
      <Link
        to="/app/audit"
        className="text-sm text-indigo-600 hover:underline"
      >
        {isThai ? 'ไปยังหน้า Audit Log เต็ม' : 'Go to full Audit Log page'}
      </Link>
    </div>
  );
}
