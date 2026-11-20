import type { MachineFingerprint } from '../core/types';

interface FingerprintChartProps {
  fingerprint: MachineFingerprint;
}

export function FingerprintChart({ fingerprint }: FingerprintChartProps) {
  const maxVal = Math.max(
    10,
    ...fingerprint.hourlyBaseline,
    ...fingerprint.hourlyObservedToday,
  );
  const [startHour, endHour] = fingerprint.allowedHoursUtc;

  const width = 720;
  const height = 220;
  const padLeft = 42;
  const padRight = 16;
  const padTop = 18;
  const padBottom = 32;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;
  const slotW = chartW / 24;

  const yFor = (val: number) => padTop + chartH - (val / maxVal) * chartH;

  const baselinePoints = fingerprint.hourlyBaseline.map((v, hr) => {
    const x = padLeft + hr * slotW + slotW / 2;
    const y = yFor(v);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const areaPath = [
    `M ${(padLeft + slotW / 2).toFixed(1)},${(padTop + chartH).toFixed(1)}`,
    ...baselinePoints.map((pt) => `L ${pt}`),
    `L ${(padLeft + 23 * slotW + slotW / 2).toFixed(1)},${(padTop + chartH).toFixed(1)}`,
    'Z',
  ].join(' ');

  const linePath = baselinePoints
    .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt}`)
    .join(' ');

  const yTicks = [0, Math.round(maxVal / 2), maxVal];

  return (
    <div className="w-full" data-testid="fingerprint-chart">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3 text-xs text-[var(--sentinel-ink-secondary)]">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-2 bg-[var(--sentinel-teal-soft)] border border-[var(--sentinel-teal)]" />
            Learned baseline (req/hr)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-2 bg-[var(--sentinel-teal)]" />
            Normal window
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-2 bg-[#DC2626]" />
            Anomaly spike
          </span>
        </div>
        <span className="font-mono tabular-nums text-[var(--sentinel-ink-muted)]">
          Allowed UTC: {String(startHour).padStart(2, '0')}:00–{String(endHour).padStart(2, '0')}:00
        </span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto block"
        role="img"
        aria-label={`24-hour API activity fingerprint chart for ${fingerprint.keyAlias}`}
      >
        {yTicks.map((tick) => {
          const y = yFor(tick);
          return (
            <g key={tick}>
              <line
                x1={padLeft}
                y1={y}
                x2={width - padRight}
                y2={y}
                stroke="var(--sentinel-divider)"
                strokeWidth="1"
              />
              <text
                x={padLeft - 8}
                y={y + 4}
                textAnchor="end"
                fill="var(--sentinel-ink-muted)"
                fontSize="10"
                fontFamily="var(--font-mono)"
              >
                {tick}
              </text>
            </g>
          );
        })}

        <rect
          x={padLeft + startHour * slotW}
          y={padTop}
          width={(endHour - startHour + 1) * slotW}
          height={chartH}
          fill="var(--sentinel-teal-soft)"
          opacity="0.45"
        />

        <path d={areaPath} fill="var(--sentinel-teal-soft)" opacity="0.8" />
        <path
          d={linePath}
          fill="none"
          stroke="var(--sentinel-teal)"
          strokeWidth="1.5"
          strokeDasharray="3 2"
        />

        {fingerprint.hourlyObservedToday.map((val, hr) => {
          if (val <= 0) return null;
          const base = fingerprint.hourlyBaseline[hr] ?? 0;
          const outsideHours = hr < startHour || hr > endHour;
          const isSpike =
            (outsideHours && val > base + 4) || val > Math.max(base * 2.1, base + 25);
          const barW = Math.max(6, slotW * 0.48);
          const x = padLeft + hr * slotW + (slotW - barW) / 2;
          const y = yFor(val);
          const barH = Math.max(2, padTop + chartH - y);

          return (
            <g key={hr}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={barH}
                rx="2"
                fill={isSpike ? '#DC2626' : 'var(--sentinel-teal)'}
                opacity={isSpike ? 0.96 : 0.8}
              />
              {isSpike && (
                <text
                  x={x + barW / 2}
                  y={Math.max(12, y - 5)}
                  textAnchor="middle"
                  fill="var(--sentinel-crit)"
                  fontSize="10"
                  fontWeight="700"
                  fontFamily="var(--font-mono)"
                >
                  {val}
                </text>
              )}
            </g>
          );
        })}

        {[0, 3, 6, 9, 12, 15, 18, 21, 23].map((hr) => (
          <text
            key={hr}
            x={padLeft + hr * slotW + slotW / 2}
            y={height - 10}
            textAnchor="middle"
            fill="var(--sentinel-ink-muted)"
            fontSize="10"
            fontFamily="var(--font-mono)"
          >
            {String(hr).padStart(2, '0')}h
          </text>
        ))}
      </svg>
    </div>
  );
}
