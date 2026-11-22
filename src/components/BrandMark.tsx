import defaultSentinelLogo from '../assets/images/sentinel_brand_logo_1795243928821.jpg';

interface BrandMarkProps {
  size?: 'sm' | 'md';
}

export function BrandMark({ size = 'md' }: BrandMarkProps) {
  return (
    <span className="inline-flex items-center gap-2.5 min-w-0 whitespace-nowrap">
      <img
        src={defaultSentinelLogo}
        alt="Sentinel brand logo"
        data-testid="default-brand-logo-img"
        className={
          size === 'sm'
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
