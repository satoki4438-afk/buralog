"use client";
import { useRef, useEffect } from "react";
import { CATEGORIES } from "@/lib/categories";

export default function AdTicker({ items, onDetail }) {
  const trackRef = useRef(null);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let pos = 0;
    const speed = 0.5;
    let raf;
    function tick() {
      pos -= speed;
      if (pos < -track.scrollWidth / 2) pos = 0;
      track.style.transform = `translateX(${pos}px)`;
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [items]);

  const doubled = [...items, ...items];

  return (
    <div style={{
      flexShrink: 0, background: "#111", overflow: "hidden",
      padding: "6px 0", display: "flex", alignItems: "center",
    }}>
      <div ref={trackRef} style={{ display: "flex", gap: 24, whiteSpace: "nowrap" }}>
        {doubled.map((item, idx) => {
          const color = CATEGORIES[item.category]?.color || "#999";
          return (
            <button
              key={idx}
              onClick={() => onDetail(item)}
              style={{
                flexShrink: 0, display: "flex", alignItems: "center", gap: 8,
                background: "transparent", border: "none", cursor: "pointer", padding: "2px 0",
              }}
            >
              <span style={{ fontSize: 10, color, fontWeight: 700 }}>AD</span>
              <span style={{ fontSize: 12, color: "#fff" }}>
                {item.productName}
              </span>
              <span style={{ fontSize: 11, color: "#888" }}>
                {item.shopName} · ¥{item.price?.toLocaleString()}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
