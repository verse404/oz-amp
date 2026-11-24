import React from 'react';
import { RotateCcw } from 'lucide-react';

interface PriceRangeSliderProps {
  minBound: number;
  maxBound: number;
  step?: number;
  value: [number, number];
  onChange: (next: [number, number]) => void;
}

export const PriceRangeSlider: React.FC<PriceRangeSliderProps> = ({
  minBound,
  maxBound,
  step = 10,
  value,
  onChange,
}) => {
  const [minVal, maxVal] = value;
  const span = Math.max(1, maxBound - minBound);
  const leftPercent = ((minVal - minBound) / span) * 100;
  const rightPercent = ((maxVal - minBound) / span) * 100;
  const isFiltered = minVal > minBound || maxVal < maxBound;

  const formatLabel = (amount: number, isUpper = false) =>
    isUpper && amount >= maxBound ? `A$${amount}+` : `A$${amount}`;

  return (
    <div className="price-range-control" aria-label="Filter concerts by entry ticket price range">
      <div className="price-range-header">
        <span className="price-range-title">Price Range (AUD):</span>
        <strong className={`price-range-readout ${isFiltered ? 'is-filtered' : ''}`}>
          {formatLabel(minVal)} – {formatLabel(maxVal, true)}
        </strong>
        {isFiltered && (
          <button
            type="button"
            className="price-reset-btn"
            onClick={() => onChange([minBound, maxBound])}
            title="Reset price range"
          >
            <RotateCcw size={11} />
            <span>Reset</span>
          </button>
        )}
      </div>

      <div className="dual-slider-stage">
        <div className="dual-slider-rail" aria-hidden="true" />
        <div
          className="dual-slider-fill"
          aria-hidden="true"
          style={{
            left: `${leftPercent}%`,
            width: `${Math.max(0, rightPercent - leftPercent)}%`,
          }}
        />

        <input
          type="range"
          id="price-range-min"
          aria-label="Minimum ticket price in AUD"
          min={minBound}
          max={maxBound}
          step={step}
          value={minVal}
          onChange={(e) => {
            const nextMin = Math.min(Number(e.target.value), maxVal - step);
            onChange([Math.max(minBound, nextMin), maxVal]);
          }}
          className="dual-slider-input dual-slider-input--min"
        />

        <input
          type="range"
          id="price-range-max"
          aria-label="Maximum ticket price in AUD"
          min={minBound}
          max={maxBound}
          step={step}
          value={maxVal}
          onChange={(e) => {
            const nextMax = Math.max(Number(e.target.value), minVal + step);
            onChange([minVal, Math.min(maxBound, nextMax)]);
          }}
          className="dual-slider-input dual-slider-input--max"
        />
      </div>

      <div className="dual-slider-ticks" aria-hidden="true">
        <span>A$0</span>
        <span>A$100</span>
        <span>A$200</span>
        <span>A$300</span>
        <span>A$400</span>
        <span>A$500+</span>
      </div>
    </div>
  );
};
