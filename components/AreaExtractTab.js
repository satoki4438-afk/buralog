"use client";
import { useEffect, useRef, useState } from "react";
import { collection, doc, getDocs, setDoc, writeBatch, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CATEGORY_LIST } from "@/lib/categories";
import { ONSEN_AREAS } from "@/lib/onsenAreas";

const AREA_TYPES = {
  A: { label: "観光地・温泉街", radius: 300, multi: true },
  B: { label: "都市部・駅前", radius: 800, multi: false },
  C: { label: "地方・普通の街", radius: 2000, multi: false },
};

const INCLUDE_TYPES = ["cafe", "bakery", "meal_takeaway", "food"];
const EXCLUDE_TYPES = ["restaurant", "bar", "night_club", "lodging"];

const TYPE_CATEGORY_MAP = {
  bakery: "洋スイーツ",
  cafe: "ドリンク",
  meal_takeaway: "ガッツリ",
};

function formatDate(ts) {
  const d = ts?.toDate ? ts.toDate() : ts;
  if (!d) return "";
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function guessCategory(types) {
  for (const t of types || []) {
    if (TYPE_CATEGORY_MAP[t]) return TYPE_CATEGORY_MAP[t];
  }
  return "ガッツリ";
}

function passesFilter(place) {
  const types = place.types || [];
  if (types.some((t) => EXCLUDE_TYPES.includes(t))) return false;
  if (!types.some((t) => INCLUDE_TYPES.includes(t))) return false;
  if (place.rating !== undefined && place.rating < 3.0) return false;
  if (place.price_level !== undefined && (place.price_level < 1 || place.price_level > 2)) return false;
  return true;
}

let pointSeq = 0;

export default function AreaExtractTab({ mapsReady, existingShopIds, onImported }) {
  const [areaName, setAreaName] = useState("");
  const [prefecture, setPrefecture] = useState("");
  const [areaType, setAreaType] = useState("A");
  const [points, setPoints] = useState([{ key: pointSeq++, label: "", lat: null, lng: null, radius: AREA_TYPES.A.radius }]);
  const [searching, setSearching] = useState(false);
  const [searchMsg, setSearchMsg] = useState("");
  const [results, setResults] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [progressMap, setProgressMap] = useState({});
  const serviceDivRef = useRef(null);

  useEffect(() => {
    (async () => {
      const snap = await getDocs(collection(db, "areaExtractProgress"));
      const map = {};
      snap.docs.forEach((d) => { map[d.data().areaName] = d.data(); });
      setProgressMap(map);
    })();
  }, []);

  function applyPreset(name) {
    const area = ONSEN_AREAS.find((a) => a.name === name);
    if (!area) return;
    setAreaName(area.name);
    setPrefecture(area.prefecture);
    setAreaType("A");
    setPoints([{ key: pointSeq++, label: area.name, lat: area.lat, lng: area.lng, radius: AREA_TYPES.A.radius }]);
    setResults([]);
    setSearchMsg("");
    setImportMsg("");
  }

  function addPoint() {
    setPoints((ps) => [...ps, { key: pointSeq++, label: "", lat: null, lng: null, radius: AREA_TYPES[areaType].radius }]);
  }

  function removePoint(key) {
    setPoints((ps) => ps.filter((p) => p.key !== key));
  }

  function updatePoint(key, patch) {
    setPoints((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  }

  function handleAreaTypeChange(type) {
    setAreaType(type);
    setPoints((ps) => ps.map((p) => ({ ...p, radius: AREA_TYPES[type].radius })));
  }

  async function handleSearch() {
    if (!mapsReady || !serviceDivRef.current) return;
    const validPoints = points.filter((p) => p.lat != null && p.lng != null);
    if (validPoints.length === 0) {
      setSearchMsg("中心座標を設定してください");
      return;
    }
    setSearching(true);
    setSearchMsg("検索中...");
    setResults([]);

    const service = new window.google.maps.places.PlacesService(serviceDivRef.current);
    const found = new Map();

    for (const point of validPoints) {
      for (const type of INCLUDE_TYPES) {
        await new Promise((resolve) => {
          service.nearbySearch(
            {
              location: new window.google.maps.LatLng(point.lat, point.lng),
              radius: point.radius,
              type,
              language: "ja",
            },
            (places, status) => {
              if (status === window.google.maps.places.PlacesServiceStatus.OK && places) {
                for (const place of places) {
                  if (!found.has(place.place_id) && passesFilter(place)) {
                    found.set(place.place_id, place);
                  }
                }
              }
              resolve();
            }
          );
        });
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    const list = Array.from(found.values()).map((place) => ({
      placeId: place.place_id,
      name: place.name,
      rating: place.rating,
      priceLevel: place.price_level,
      types: place.types || [],
      vicinity: place.vicinity || "",
      lat: place.geometry.location.lat(),
      lng: place.geometry.location.lng(),
      category: guessCategory(place.types),
      selected: !existingShopIds.has(place.place_id),
      isExisting: existingShopIds.has(place.place_id),
    }));

    list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    setResults(list);
    setSearching(false);
    setSearchMsg(`${list.length}件ヒット（既存: ${list.filter((r) => r.isExisting).length}件）`);
  }

  function toggleResult(placeId) {
    setResults((rs) => rs.map((r) => (r.placeId === placeId ? { ...r, selected: !r.selected } : r)));
  }

  function setResultCategory(placeId, category) {
    setResults((rs) => rs.map((r) => (r.placeId === placeId ? { ...r, category } : r)));
  }

  function toggleAll(checked) {
    setResults((rs) => rs.map((r) => (r.isExisting ? r : { ...r, selected: checked })));
  }

  async function handleImport() {
    const targets = results.filter((r) => r.selected && !r.isExisting);
    if (targets.length === 0) return;
    setImporting(true);
    const batch = writeBatch(db);
    for (const r of targets) {
      const id = `item_${r.placeId.replace(/[^a-zA-Z0-9]/g, "_")}`;
      batch.set(doc(db, "items", id), {
        id,
        shopId: r.placeId,
        productName: r.name,
        shopName: r.name,
        catchphrase: "",
        price: 0,
        area: areaName,
        prefecture,
        category: r.category,
        location: { lat: r.lat, lng: r.lng },
        address: r.vicinity,
        phone: null,
        hours: null,
        holiday: null,
        imageUrls: [],
        payment: ["cash"],
        hasTrashCan: false,
        eatStyle: "one-hand",
        radarStats: {
          junk: { total: 0, count: 0 }, photo: { total: 0, count: 0 },
          cospa: { total: 0, count: 0 }, walk: { total: 0, count: 0 }, local: { total: 0, count: 0 },
        },
        isPremium: false, isAd: false, verified: false,
      });
    }
    await batch.commit();

    if (areaName) {
      const progressId = encodeURIComponent(areaName);
      await setDoc(doc(db, "areaExtractProgress", progressId), {
        areaName, prefecture, lastExtractedAt: serverTimestamp(), importedCount: targets.length,
      }, { merge: true });
      setProgressMap((m) => ({ ...m, [areaName]: { areaName, prefecture, lastExtractedAt: new Date(), importedCount: targets.length } }));
    }

    setImporting(false);
    setImportMsg(`✅ ${targets.length}件インポートしました`);
    onImported();
    setResults((rs) => rs.map((r) => (r.selected && !r.isExisting ? { ...r, isExisting: true, selected: false } : r)));
  }

  const selectedCount = results.filter((r) => r.selected && !r.isExisting).length;

  return (
    <div style={{ padding: 16, maxWidth: 700, margin: "0 auto" }}>
      <div ref={serviceDivRef} style={{ width: 1, height: 1, position: "absolute", opacity: 0 }} />

      {/* 温泉地プリセット */}
      <Field label="温泉地プリセット">
        <select
          defaultValue=""
          onChange={(e) => { if (e.target.value) applyPreset(e.target.value); e.target.value = ""; }}
          style={inputStyle}
        >
          <option value="">選択してください...</option>
          {ONSEN_AREAS.map((a) => {
            const p = progressMap[a.name];
            const label = p
              ? `✅ ${a.name}（${a.prefecture}）- 最終更新: ${formatDate(p.lastExtractedAt)} ${p.importedCount}件`
              : `${a.name}（${a.prefecture}）`;
            return <option key={a.name} value={a.name}>{label}</option>;
          })}
        </select>
      </Field>

      {/* エリア基本情報 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        <Field label="エリア名">
          <input type="text" value={areaName} onChange={(e) => setAreaName(e.target.value)} placeholder="例：近江町市場" style={inputStyle} />
        </Field>
        <Field label="都道府県">
          <input type="text" value={prefecture} onChange={(e) => setPrefecture(e.target.value)} placeholder="例：石川県" style={inputStyle} />
        </Field>
      </div>

      {/* エリアタイプ */}
      <Field label="エリアタイプ">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {Object.entries(AREA_TYPES).map(([key, t]) => (
            <button
              key={key}
              onClick={() => handleAreaTypeChange(key)}
              style={{
                padding: "8px 14px", borderRadius: 8, fontSize: 12, cursor: "pointer",
                border: areaType === key ? "2px solid #111" : "1px solid #ddd",
                background: areaType === key ? "#111" : "#fff",
                color: areaType === key ? "#fff" : "#333",
                fontWeight: areaType === key ? 700 : 400,
              }}
            >
              {key}: {t.label}（半径{t.radius}m）
            </button>
          ))}
        </div>
      </Field>

      {/* 検索ポイント */}
      <Field label="検索ポイント（中心座標）">
        {points.map((point, idx) => (
          <PointInput
            key={point.key}
            point={point}
            mapsReady={mapsReady}
            onUpdate={(patch) => updatePoint(point.key, patch)}
            onRemove={points.length > 1 ? () => removePoint(point.key) : null}
          />
        ))}
        {AREA_TYPES[areaType].multi && (
          <button onClick={addPoint} style={{
            marginTop: 4, padding: "6px 14px", borderRadius: 8, fontSize: 12,
            border: "1px dashed #999", background: "#fff", cursor: "pointer", color: "#666",
          }}>
            ＋ ポイント追加
          </button>
        )}
      </Field>

      {/* 抽出開始 */}
      <button
        onClick={handleSearch}
        disabled={searching || !mapsReady}
        style={{
          width: "100%", padding: "12px 0", borderRadius: 10, border: "none",
          background: searching ? "#ddd" : "#0EA5E9", color: searching ? "#999" : "#fff",
          fontSize: 14, fontWeight: 700, cursor: searching ? "default" : "pointer", marginTop: 8,
        }}
      >
        {searching ? "検索中..." : "🔍 抽出開始"}
      </button>
      {searchMsg && <div style={{ fontSize: 12, color: "#666", marginTop: 8, textAlign: "center" }}>{searchMsg}</div>}

      {/* 結果一覧 */}
      {results.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>候補一覧（{results.length}件）</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => toggleAll(true)} style={smallBtnStyle}>全選択</button>
              <button onClick={() => toggleAll(false)} style={smallBtnStyle}>全解除</button>
            </div>
          </div>

          {results.map((r) => (
            <div key={r.placeId} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
              background: "#fff", borderRadius: 8, marginBottom: 6,
              border: r.isExisting ? "1px solid #eee" : "1px solid #ddd",
              opacity: r.isExisting ? 0.5 : 1,
            }}>
              <input
                type="checkbox"
                checked={r.selected}
                disabled={r.isExisting}
                onChange={() => toggleResult(r.placeId)}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>
                  {r.name}
                  {r.isExisting && <span style={{ fontSize: 10, color: "#999", marginLeft: 6 }}>（登録済み）</span>}
                </div>
                <div style={{ fontSize: 11, color: "#888" }}>
                  {r.rating ? `★${r.rating}` : "評価なし"} · {r.vicinity}
                </div>
              </div>
              <select
                value={r.category}
                disabled={r.isExisting}
                onChange={(e) => setResultCategory(r.placeId, e.target.value)}
                style={{ fontSize: 12, padding: "4px 6px", borderRadius: 6, border: "1px solid #ddd" }}
              >
                {CATEGORY_LIST.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          ))}

          <button
            onClick={handleImport}
            disabled={importing || selectedCount === 0}
            style={{
              width: "100%", padding: "12px 0", borderRadius: 10, border: "none",
              background: selectedCount === 0 ? "#ddd" : "#111",
              color: selectedCount === 0 ? "#999" : "#fff",
              fontSize: 14, fontWeight: 700, cursor: selectedCount === 0 ? "default" : "pointer", marginTop: 8,
            }}
          >
            {importing ? "インポート中..." : `選択した${selectedCount}件をインポート`}
          </button>
          {importMsg && <div style={{ fontSize: 12, color: "#166534", marginTop: 8, textAlign: "center" }}>{importMsg}</div>}
        </div>
      )}
    </div>
  );
}

function PointInput({ point, mapsReady, onUpdate, onRemove }) {
  const inputRef = useRef(null);
  const acRef = useRef(null);

  useEffect(() => {
    if (!mapsReady || !inputRef.current || acRef.current) return;
    const ac = new window.google.maps.places.Autocomplete(inputRef.current, { language: "ja" });
    acRef.current = ac;
    ac.addListener("place_changed", () => {
      const place = ac.getPlace();
      if (!place?.geometry) return;
      onUpdate({
        label: place.name || place.formatted_address,
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
      });
    });
  }, [mapsReady]);

  function tryParseLatLng(value) {
    const m = value.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (!m) return;
    onUpdate({ label: value, lat: Number(m[1]), lng: Number(m[2]) });
  }

  function handleKeyDown(e) {
    if (e.key !== "Enter") return;
    tryParseLatLng(e.target.value);
  }

  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
      <input ref={inputRef} type="text" placeholder="場所を検索 または 緯度,経度" defaultValue={point.label} onKeyDown={handleKeyDown} onBlur={(e) => tryParseLatLng(e.target.value)} style={{ ...inputStyle, flex: 2 }} />
      <input
        type="number"
        value={point.radius}
        onChange={(e) => onUpdate({ radius: Number(e.target.value) })}
        style={{ ...inputStyle, flex: 1 }}
        title="半径(m)"
      />
      {onRemove && (
        <button onClick={onRemove} style={{ padding: "0 12px", borderRadius: 8, border: "1px solid #fee2e2", background: "#fff", color: "#ef4444", cursor: "pointer", fontSize: 12 }}>
          削除
        </button>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "8px 12px", borderRadius: 8,
  border: "1px solid #ddd", fontSize: 14, outline: "none", background: "#fff",
};

const smallBtnStyle = {
  padding: "4px 10px", borderRadius: 6, border: "1px solid #ddd",
  background: "#fff", cursor: "pointer", fontSize: 11,
};
