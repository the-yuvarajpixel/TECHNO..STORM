import { useEffect, useRef, useState, type DragEvent, type ChangeEvent } from 'react';
import { Check, Download, ImagePlus, RotateCcw, Upload, X } from 'lucide-react';
import defaultSentinelLogo from '../assets/images/sentinel_brand_logo_1795243928821.jpg';

export const DEFAULT_SENTINEL_LOGO_URL = defaultSentinelLogo;
export const BRAND_LOGO_STORAGE_KEY = 'sentinel-custom-brand-logo-v1';
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_RASTER_DIM = 512;

export function loadCustomBrandLogo(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(BRAND_LOGO_STORAGE_KEY);
    if (!stored || !stored.startsWith('data:image/')) return null;
    return stored;
  } catch {
    return null;
  }
}

export function saveCustomBrandLogo(dataUrl: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!dataUrl) {
      window.localStorage.removeItem(BRAND_LOGO_STORAGE_KEY);
    } else {
      window.localStorage.setItem(BRAND_LOGO_STORAGE_KEY, dataUrl);
    }
  } catch {
    // Ignore storage quota errors in restricted iframe environments
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Could not read the selected image file.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read the selected image file.'));
    reader.readAsDataURL(file);
  });
}

function optimizeLogoDataUrl(file: File, rawDataUrl: string): Promise<string> {
  // Keep SVG and GIF as-is (rendered strictly inside sandboxed <img> elements)
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
    return Promise.resolve(rawDataUrl);
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const { naturalWidth: w, naturalHeight: h } = img;
      if (!w || !h || (w <= MAX_RASTER_DIM && h <= MAX_RASTER_DIM)) {
        resolve(rawDataUrl);
        return;
      }
      const scale = Math.min(MAX_RASTER_DIM / w, MAX_RASTER_DIM / h);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(rawDataUrl);
        return;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      try {
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(rawDataUrl);
      }
    };
    img.onerror = () => resolve(rawDataUrl);
    img.src = rawDataUrl;
  });
}

interface BrandMarkProps {
  logoUrl: string | null;
  size?: 'sm' | 'md';
  showFallbackIcon?: boolean;
}

export function BrandMark({ logoUrl, size = 'md' }: BrandMarkProps) {
  const isCustom = Boolean(logoUrl);
  const src = logoUrl || defaultSentinelLogo;

  return (
    <span className="inline-flex items-center gap-2.5 min-w-0 whitespace-nowrap">
      <img
        src={src}
        alt={isCustom ? 'Sentinel custom workspace logo' : 'Sentinel brand logo'}
        data-testid={isCustom ? 'custom-brand-logo-img' : 'default-brand-logo-img'}
        className={
          isCustom
            ? size === 'sm'
              ? 'h-6 max-w-[112px] w-auto object-contain rounded-sm shrink-0'
              : 'h-8 max-w-[140px] w-auto object-contain rounded-sm shrink-0'
            : size === 'sm'
              ? 'w-7 h-7 object-cover rounded-md border border-[var(--sentinel-border)] shrink-0 shadow-xs'
              : 'w-8 h-8 object-cover rounded-md border border-[var(--sentinel-border)] shrink-0 shadow-xs'
        }
      />
      <span
        className={
          size === 'sm'
            ? 'font-title text-base font-bold tracking-tight text-[var(--sentinel-ink)] whitespace-nowrap'
            : 'font-title text-xl font-bold tracking-tight text-[var(--sentinel-ink)] whitespace-nowrap'
        }
      >
        Sentinel
      </span>
    </span>
  );
}

interface BrandLogoModalProps {
  open: boolean;
  currentLogoUrl: string | null;
  onClose: () => void;
  onSaveLogo: (dataUrl: string | null) => void;
}

export function BrandLogoModal({
  open,
  currentLogoUrl,
  onClose,
  onSaveLogo,
}: BrandLogoModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [draftLogoUrl, setDraftLogoUrl] = useState<string | null>(currentLogoUrl);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (open) {
      setDraftLogoUrl(currentLogoUrl);
      setFileName(null);
      setError(null);
      setDragging(false);
    }
  }, [open, currentLogoUrl]);

  if (!open) return null;

  const processSelectedFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);

    if (!file.type.startsWith('image/')) {
      setError('Unsupported file type. Please choose a PNG, JPG, SVG, or WebP image.');
      return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      setError('Image is larger than 2 MB. Please choose a smaller logo file.');
      return;
    }

    setProcessing(true);
    try {
      const rawDataUrl = await readFileAsDataUrl(file);
      const optimized = await optimizeLogoDataUrl(file, rawDataUrl);
      setDraftLogoUrl(optimized);
      setFileName(file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to process the selected image.');
    } finally {
      setProcessing(false);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    void processSelectedFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    void processSelectedFile(file);
  };

  const handleApply = () => {
    onSaveLogo(draftLogoUrl);
    onClose();
  };

  const handleReset = () => {
    setDraftLogoUrl(null);
    setFileName(null);
    setError(null);
    onSaveLogo(null);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="brand-logo-modal-title"
      data-testid="brand-logo-modal"
    >
      <div className="window-suede rounded-lg w-full max-w-lg shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--sentinel-border)] bg-[var(--sentinel-nude)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <ImagePlus className="w-4 h-4 text-[var(--sentinel-accent)] shrink-0" />
            <h2
              id="brand-logo-modal-title"
              className="font-title text-base font-semibold text-[var(--sentinel-ink)] truncate"
            >
              Upload Workspace Logo
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close logo upload modal"
            className="p-1.5 rounded-md text-[var(--sentinel-ink-secondary)] hover:text-[var(--sentinel-ink)] hover:bg-[var(--sentinel-hover)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-[var(--sentinel-ink-secondary)] leading-relaxed">
            Upload a PNG, SVG, JPG, or WebP brand mark (max 2 MB). It replaces the default header and sidebar mark across the landing page and Admin Console.
          </p>

          {/* Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            data-testid="logo-upload-dropzone"
            className={`rounded-md border-2 border-dashed p-6 text-center transition-colors cursor-pointer ${
              dragging
                ? 'border-[var(--sentinel-accent)] bg-[var(--sentinel-accent-soft)]/50'
                : 'border-[var(--sentinel-border)] bg-[var(--sentinel-inset)] hover:border-[var(--sentinel-accent)]'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
              onChange={handleFileChange}
              data-testid="logo-upload-file-input"
              className="hidden"
            />
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-md bg-[var(--sentinel-suede)] border border-[var(--sentinel-border)] flex items-center justify-center text-[var(--sentinel-accent)]">
                <Upload className="w-5 h-5" />
              </div>
              <p className="text-sm font-semibold text-[var(--sentinel-ink)]">
                {processing ? 'Processing image...' : 'Drop your logo here or click to browse'}
              </p>
              <p className="text-[11px] font-mono text-[var(--sentinel-ink-muted)]">
                {fileName ? `Selected: ${fileName}` : 'PNG · SVG · WebP · JPG · Up to 2 MB'}
              </p>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="p-2.5 rounded-md alert-pop-critical text-xs font-medium text-[var(--sentinel-crit-ink)]"
            >
              {error}
            </div>
          )}

          {/* Light & Dark Surface Preview */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--sentinel-ink-muted)]">
                Header Preview
              </p>
              <a
                href={draftLogoUrl || defaultSentinelLogo}
                download={draftLogoUrl ? 'sentinel-custom-logo.png' : 'sentinel-official-logo.jpg'}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--sentinel-accent)] hover:underline"
              >
                <Download className="w-3 h-3" />
                <span>Download Logo</span>
              </a>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="rounded-md border border-[#E2E8F0] bg-[#FFFFFF] px-3.5 py-3 flex items-center justify-between">
                <span className="inline-flex items-center gap-2.5">
                  <img
                    src={draftLogoUrl || defaultSentinelLogo}
                    alt="Light theme logo preview"
                    className={
                      draftLogoUrl
                        ? 'h-7 max-w-[110px] w-auto object-contain rounded-sm'
                        : 'w-8 h-8 object-cover rounded-md border border-[#E2E8F0]'
                    }
                  />
                  <span className="font-title text-base font-bold tracking-tight text-[#0F172A]">
                    Sentinel
                  </span>
                </span>
                <span className="font-mono text-[10px] text-[#64748B]">Light</span>
              </div>

              <div className="rounded-md border border-[#243247] bg-[#121A2B] px-3.5 py-3 flex items-center justify-between">
                <span className="inline-flex items-center gap-2.5">
                  <img
                    src={draftLogoUrl || defaultSentinelLogo}
                    alt="Dark theme logo preview"
                    className={
                      draftLogoUrl
                        ? 'h-7 max-w-[110px] w-auto object-contain rounded-sm'
                        : 'w-8 h-8 object-cover rounded-md border border-[#243247]'
                    }
                  />
                  <span className="font-title text-base font-bold tracking-tight text-[#F1F5F9]">
                    Sentinel
                  </span>
                </span>
                <span className="font-mono text-[10px] text-[#7D90AB]">Dark</span>
              </div>
            </div>
          </div>
        </div>

        <div className="px-5 py-3.5 border-t border-[var(--sentinel-border)] bg-[var(--sentinel-nude)] flex flex-wrap items-center justify-between gap-2">
          {currentLogoUrl || draftLogoUrl ? (
            <button
              type="button"
              onClick={handleReset}
              data-testid="logo-reset-btn"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-[var(--sentinel-border)] bg-[var(--sentinel-suede)] text-[var(--sentinel-ink-secondary)] hover:text-[var(--sentinel-crit-ink)] hover:border-[var(--sentinel-crit-border)] cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Default</span>
            </button>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-semibold rounded-md border border-[var(--sentinel-border)] bg-[var(--sentinel-suede)] text-[var(--sentinel-ink)] hover:border-[var(--sentinel-accent)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!draftLogoUrl || processing}
              onClick={handleApply}
              data-testid="logo-save-btn"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md bg-[var(--sentinel-accent)] hover:bg-[var(--sentinel-accent-hover)] disabled:opacity-50 text-white cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Save Logo</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
