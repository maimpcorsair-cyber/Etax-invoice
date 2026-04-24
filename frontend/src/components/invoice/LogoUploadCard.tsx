import { useLanguage } from '../../hooks/useLanguage';

interface Props {
  logoUrl: string | null;
  onLogoChange: (url: string | null) => void;
}

export default function LogoUploadCard({ logoUrl, onLogoChange }: Props) {
  const { isThai } = useLanguage();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => onLogoChange(event.target?.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div className="card">
      <label className="label">
        {isThai ? 'โลโก้บริษัท (ไม่บังคับ)' : 'Company Logo (Optional)'}
      </label>
      <div className="flex items-center gap-4">
        <input
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="flex-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
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
      {logoUrl && (
        <img src={logoUrl} alt="logo preview" className="mt-3 h-16 object-contain" />
      )}
      <p className="text-xs text-gray-500 mt-2">
        {isThai
          ? 'สนับสนุน PNG, JPG, SVG - ขนาดไม่เกิน 5 MB'
          : 'Supports PNG, JPG, SVG - max 5 MB'}
      </p>
    </div>
  );
}
