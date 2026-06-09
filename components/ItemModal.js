"use client";
import { useState, useEffect } from "react";
import { doc, updateDoc, increment } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CATEGORIES } from "@/lib/categories";

const RADAR_LABELS = {
  junk:  "ジャンク感",
  photo: "映え度",
  cospa: "コスパ",
  walk:  "食べ歩きしやすさ",
  local: "地元感",
};

export default function ItemModal({ item, onClose }) {
  const color = CATEGORIES[item.category]?.color || "#999";
  const [voted, setVoted] = useState(false);
  const [sliders, setSliders] = useState({ junk: 3, photo: 3, cospa: 3, walk: 3, local: 3 });
  const [submitting, setSubmitting] = useState(false);
  const [stats, setStats] = useState(item.radarStats || {});

  useEffect(() => {
    const key = `voted_${item.id}`;
    setVoted(!!localStorage.getItem(key));
  }, [item.id]);

  async function handleVote() {
    if (voted || submitting) return;
    setSubmitting(true);
    const ref = doc(db, "items", item.id);
    const updates = {};
    Object.entries(sliders).forEach(([k, v]) => {
      updates[`radarStats.${k}.total`] = increment(v);
      updates[`radarStats.${k}.count`] = increment(1);
    });
    await updateDoc(ref, updates);
    localStorage.setItem(`voted_${item.id}`, "1");
    setVoted(true);
    setSubmitting(false);
    const newStats = { ...stats };
    Object.entries(sliders).forEach(([k, v]) => {
      newStats[k] = {
        total: (newStats[k]?.total || 0) + v,
        count: (newStats[k]?.count || 0) + 1,
      };
    });
    setStats(newStats);
  }

  const radarData = Object.entries(RADAR_LABELS).map(([key, label]) => {
    const s = stats[key];
    const avg = s?.count ? s.total / s.count : 0;
    return { key, label, avg };
  });

  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.address || item.shopName)}`;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
        zIndex: 1000, display: "flex", alignItems: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxHeight: "85dvh", background: "#fff",
          borderRadius: "20px 20px 0 0", overflowY: "auto", paddingBottom: 32,
        }}
      >
        {/* ヘッダー */}
        <div style={{ padding: "20px 20px 0" }}>
          <div style={{ width: 40, height: 4, background: "#ddd", borderRadius: 2, margin: "0 auto 16px" }} />
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 12, background: CATEGORIES[item.category]?.bg, color, fontWeight: 700 }}>
              {item.category}
            </span>
            <span style={{ fontSize: 12, color: "#999" }}>{item.area} · {item.prefecture}</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#111", lineHeight: 1.3 }}>{item.productName}</div>
          <div style={{ fontSize: 14, color: "#555", marginTop: 4 }}>{item.shopName}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#e85", marginTop: 8 }}>¥{item.price?.toLocaleString()}</div>
        </div>

        {/* キャッチコピー */}
        {item.catchphrase && (
          <div style={{ margin: "16px 20px 0", padding: 12, background: "#f9f9f9", borderRadius: 10, fontSize: 13, color: "#444", lineHeight: 1.6 }}>
            {item.catchphrase}
          </div>
        )}

        {/* 店舗情報 */}
        <div style={{ margin: "16px 20px 0" }}>
          <InfoRow label="住所" value={item.address} link={mapUrl} linkLabel="地図で開く" />
          <InfoRow label="電話" value={item.phone} />
          <InfoRow label="営業時間" value={item.hours} />
          <InfoRow label="定休日" value={item.holiday} />
          <InfoRow label="支払い" value={item.payment?.map((p) => payLabel(p)).join(" / ")} />
          <InfoRow label="ゴミ箱" value={item.hasTrashCan ? "あり ✓" : "なし"} />
        </div>

        {/* レーダーチャート */}
        <div style={{ margin: "20px 20px 0" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#333", marginBottom: 12 }}>みんなの評価</div>
          <RadarChart data={radarData} color={color} />
        </div>

        {/* 投票 */}
        <div style={{ margin: "20px 20px 0" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#333", marginBottom: 12 }}>
            {voted ? "投票済み" : "あなたの評価（1回のみ）"}
          </div>
          {!voted && (
            <>
              {Object.entries(RADAR_LABELS).map(([key, label]) => (
                <div key={key} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#555", marginBottom: 4 }}>
                    <span>{label}</span>
                    <span style={{ fontWeight: 700, color }}>{sliders[key]}</span>
                  </div>
                  <input
                    type="range" min={1} max={5} step={1}
                    value={sliders[key]}
                    onChange={(e) => setSliders((s) => ({ ...s, [key]: Number(e.target.value) }))}
                    style={{ width: "100%", accentColor: color }}
                  />
                </div>
              ))}
              <button
                onClick={handleVote}
                disabled={submitting}
                style={{
                  width: "100%", padding: "12px 0", borderRadius: 12,
                  background: color, color: "#fff", border: "none",
                  fontSize: 14, fontWeight: 700, cursor: "pointer", marginTop: 4,
                }}
              >
                {submitting ? "送信中..." : "投票する"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, link, linkLabel }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", gap: 8, padding: "6px 0", borderBottom: "1px solid #f0f0f0", fontSize: 13 }}>
      <span style={{ color: "#999", flexShrink: 0, width: 72 }}>{label}</span>
      <span style={{ color: "#333", flex: 1 }}>{value}</span>
      {link && (
        <a href={link} target="_blank" rel="noopener noreferrer"
          style={{ color: "#0EA5E9", flexShrink: 0, fontSize: 12 }}>
          {linkLabel}
        </a>
      )}
    </div>
  );
}

function payLabel(p) {
  const map = { cash: "現金", paypay: "PayPay", card: "カード", ic: "交通系IC" };
  return map[p] || p;
}

function RadarChart({ data, color }) {
  const cx = 100, cy = 100, r = 70;
  const n = data.length;
  const points = data.map((_, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });

  const valuePoints = data.map((d, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const ratio = d.avg / 5;
    return { x: cx + r * ratio * Math.cos(angle), y: cy + r * ratio * Math.sin(angle) };
  });

  const toPath = (pts) => pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";

  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <svg width={200} height={200} viewBox="0 0 200 200">
        {[1, 2, 3, 4, 5].map((lv) => (
          <polygon
            key={lv}
            points={points.map((p, i) => {
              const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
              const rv = r * (lv / 5);
              return `${cx + rv * Math.cos(angle)},${cy + rv * Math.sin(angle)}`;
            }).join(" ")}
            fill="none" stroke="#eee" strokeWidth={1}
          />
        ))}
        {points.map((p, i) => (
          <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#eee" strokeWidth={1} />
        ))}
        <path d={toPath(valuePoints)} fill={color} fillOpacity={0.2} stroke={color} strokeWidth={2} />
        {data.map((d, i) => (
          <text
            key={d.key}
            x={points[i].x}
            y={points[i].y + (points[i].y < cy ? -6 : 14)}
            textAnchor="middle"
            fontSize={9}
            fill="#666"
          >
            {d.label}
          </text>
        ))}
      </svg>
    </div>
  );
}
