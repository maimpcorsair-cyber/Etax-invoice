import { useRef } from 'react';
import { Camera, Upload } from 'lucide-react';
import { useLanguage } from '../../hooks/useLanguage';
import { pickImageNative, isNative } from '../../hooks/useNative';

interface Props {
  logoUrl: string | null;
  onLogoChange: (url: string | null) => void;
}

export default function LogoUploadCard({ logoUrl, onLogoChange }: Props) {
  const { isThai } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Web: read file as data URL
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => onLogoChange(event.target?.result as string);
    reader.readAsDataURL(file);
  };

  // Native (Android/iOS): open camera / photo picker via Capacitor
  const handleNativePick = async () => {
    const dataUrl = await pickImageNative();
    if (dataUrl) onLogoChange(dataUrl);
  };

  return (
    <div className="card">
      <label className="label">
        {isThai ? 'โลโก้บริษัท (ไม่บังคับ)' : 'Company Logo (Optional)'}
      </label>

      {isNative() ? (
        /* ── Native: Camera / Photos button ── */
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleNativePick}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-50 text-blue-700 font-medium text-sm hover:bg-blue-100 active:scale-95 transition-all"
          >
            <Camera className="w-4 h-4" />
            {isThai ? 'เลือกรูปภาพ' : 'Choose Image'}
          </button>
          {logoUrl && (
            <button
              type="button"
              onClick={() => onLogoChange(null)}
              className="text-red-500 hover:text-red-700 font-semibold text-sm px-3 py-2 rounded hover:bg-red-50"
            >
              ✕
            </button>
          )}
        </div>
      ) : (
        /* ── Web: standard file input ── */
        <div className="flex items-center gap-4">
          <label className="flex-1 flex items-center gap-2 cursor-pointer px-4 py-2.5 rounded-lg border border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 transition-colors">
            <Upload className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-500">
              {isThai ? 'คลิกเพื่อเลือกไฟล์' : 'Click to upload'}
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="sr-only"
            />
          </label>
          {logoUrl && (
            <button
              type="button"
              onClick={() => onLogoChange(null)}
              className="text-red-500 hover:text-red-700 font-semibold text-sm px-3 py-2 rounded hover:bg-red-50"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {logoUrl && (
        <img src={logoUrl} alt="logo preview" className="mt-3 h-16 object-contain" />
      )}
      <p className="text-xs text-gray-500 mt-2">
        {isThai
          ? 'สนับสนุน PNG, JPG, SVG - ขนาดไม่เกิน 5 MB'
          : 'Supports PNG, JPG, SVG – max 5 MB'}
      </p>
    </div>
  );
}
