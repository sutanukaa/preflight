"use client";

import { useEffect, useState } from "react";

export function Waveform({ active = true, barCount = 24 }: { active?: boolean; barCount?: number }) {
  const [heights, setHeights] = useState<number[]>(() =>
    Array.from({ length: barCount }, () => Math.floor(Math.random() * 28) + 6)
  );

  useEffect(() => {
    if (!active) {
      setHeights(Array.from({ length: barCount }, () => 6));
      return;
    }

    const interval = setInterval(() => {
      setHeights((prev) =>
        prev.map(() => Math.floor(Math.random() * 32) + 6)
      );
    }, 120);

    return () => clearInterval(interval);
  }, [active, barCount]);

  return (
    <div className="flex items-center gap-[3px] h-10 px-2 justify-center">
      {heights.map((h, i) => (
        <span
          key={i}
          className="w-1 rounded-full bg-brand transition-all duration-150 ease-out"
          style={{
            height: `${h}px`,
            opacity: active ? (h > 18 ? 0.95 : 0.6) : 0.25,
          }}
        />
      ))}
    </div>
  );
}
