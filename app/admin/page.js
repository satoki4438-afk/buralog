"use client";
import { useEffect, useRef, useState } from "react";
import { collection, getDocs, doc, updateDoc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CATEGORY_LIST } from "@/lib/categories";

const EMPTY_ITEM = {
  shopId: "", productName: "", shopName: "", catchphrase: "",
  price: "", area: "", prefecture: "", category: "ガッツリ",
  location: { lat: "", lng: "" }, address: "", phone: "",
  hours: "", holiday: "", imageUrls: [], payment: [],
  hasTrashCan: false, eatStyle: "one-hand",
  radarStats: { junk:{total:0,count:0}, photo:{total:0,count:0}, cospa:{total:0,count:0}, walk:{total:0,count:0}, local:{total:0,count:0} },
  isPremium: false, isAd: false, verified: false,
};

export default function AdminPage() {
  const [items, setItems] = useState([]);
  const [tab, setTab] = useState("list");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_ITEM);
  const [mapsReady, setMapsReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [bulkFixing, setBulkFixing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(null);
  const bulkDivRef = useRef(null);

  useEffect(() => { loadItems(); }, []);

  async function loadItems() {
    const snap = await getDocs(collection(db, "items"));
    setItems(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.google) { setMapsReady(true); return; }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places&language=ja`;
    script.async = true;
    script.onload = () => setMapsReady(true);
    document.head.appendChild(script);
  }, []);

  async function handleBulkFix() {
    if (!mapsReady || !bulkDivRef.current) return;
    const targets = items.filter((i) => i.shopId?.startsWith("PENDING_"));
    if (targets.length === 0) return;
    setBulkFixing(true);
    setBulkProgress({ done: 0, failed: 0, total: targets.length });
    const service = new window.google.maps.places.PlacesService(bulkDivRef.current);

    for (const item of targets) {
      await new Promise((resolve) => {
        service.textSearch(
          { query: item.shopName, language: "ja" },
          (results, status) => {
            if (status !== window.google.maps.places.PlacesServiceStatus.OK || !results?.[0]) {
              setBulkProgress((p) => ({ ...p, failed: p.failed + 1 }));
              resolve();
              return;
            }
            const basic = results[0];
            service.getDetails(
              {
                placeId: basic.place_id,
                fields: ["place_id", "name", "formatted_address", "formatted_phone_number", "opening_hours", "geometry"],
                language: "ja",
              },
              async (detail, dStatus) => {
                const place = dStatus === window.google.maps.places.PlacesServiceStatus.OK && detail ? detail : basic;
                const hours = place.opening_hours?.weekday_text?.join(" / ") || null;
                await updateDoc(doc(db, "items", item.id), {
                  shopId: place.place_id,
                  shopName: place.name || item.shopName,
                  address: place.formatted_address || item.address,
                  phone: place.formatted_phone_number || item.phone || null,
                  hours: hours || item.hours || null,
                  location: {
                    lat: place.geometry.location.lat(),
                    lng: place.geometry.location.lng(),
                  },
                });
                setBulkProgress((p) => ({ ...p, done: p.done + 1 }));
                resolve();
              }
            );
          }
        );
      });
      await new Promise((r) => setTimeout(r, 300));
    }

    await loadItems();
    setBulkFixing(false);
  }

  function openNew() {
    setEditing(null);
    setForm(EMPTY_ITEM);
    setTab("edit");
  }

  function openEdit(item) {
    setEditing(item.id);
    setForm({ ...EMPTY_ITEM, ...item });
    setTab("edit");
  }

  async function handleSave() {
    if (!form.productName || !form.shopName) { setMsg("商品名・店名は必須です"); return; }
    setSaving(true);
    const data = {
      ...form,
      price: Number(form.price) || 0,
      location: { lat: parseFloat(form.location.lat) || 0, lng: parseFloat(form.location.lng) || 0 },
    };
    if (editing) {
      await updateDoc(doc(db, "items", editing), data);
    } else {
      const id = `item_${Date.now()}`;
      await setDoc(doc(db, "items", id), { ...data, id });
    }
    setMsg("保存しました");
    await loadItems();
    setSaving(false);
    setTimeout(() => setMsg(""), 2000);
  }

  async function handleDelete(id) {
    if (!confirm("削除しますか？")) return;
    await deleteDoc(doc(db, "items", id));
    await loadItems();
  }

  function setF(key, val) { setForm((f) => ({ ...f, [key]: val })); }

  const pendingItems = items.filter((i) => i.shopId?.startsWith("PENDING_"));

  return (
    <div style={{ minHeight: "100dvh", background: "#f5f5f5", fontFamily: "sans-serif" }}>
      {/* ヘッダー */}
      <div style={{ background: "#111", padding: "12px 20px", display: "flex", alignItems: "center", gap: 16 }}>
        <span style={{ color: "#fff", fontWeight: 800, fontSize: 16 }}>ブラログ Admin</span>
        <span style={{ color: "#888", fontSize: 12 }}>全{items.length}件</span>
        {pendingItems.length > 0 && (
          <span style={{ color: "#f59e0b", fontSize: 12, fontWeight: 700 }}>未修正: {pendingItems.length}件</span>
        )}
      </div>

      {/* タブ */}
      <div style={{ display: "flex", background: "#fff", borderBottom: "1px solid #eee" }}>
        {[["list","一覧"], ["fix","座標修正"], ["edit", editing ? "編集" : "新規追加"]].map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "12px 20px", border: "none", cursor: "pointer",
            background: tab === t ? "#111" : "#fff",
            color: tab === t ? "#fff" : "#333",
            fontSize: 13, fontWeight: tab === t ? 700 : 400,
            position: "relative",
          }}>
            {label}
            {t === "fix" && pendingItems.length > 0 && (
              <span style={{
                position: "absolute", top: 8, right: 6,
                background: "#f59e0b", color: "#fff", borderRadius: 10,
                fontSize: 10, padding: "1px 5px", fontWeight: 700,
              }}>{pendingItems.length}</span>
            )}
          </button>
        ))}
        <button onClick={openNew} style={{
          marginLeft: "auto", padding: "12px 20px", border: "none", cursor: "pointer",
          background: "#0EA5E9", color: "#fff", fontSize: 13, fontWeight: 700,
        }}>
          ＋ 新規
        </button>
      </div>

      {/* 一覧 */}
      {tab === "list" && (
        <div style={{ padding: 16 }}>
          {items.map((item) => (
            <div key={item.id} style={{
              background: "#fff", borderRadius: 10, padding: "12px 16px",
              marginBottom: 8, display: "flex", alignItems: "center", gap: 12,
              border: item.shopId?.startsWith("PENDING_") ? "1px solid #f59e0b" : "1px solid #eee",
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{item.productName}</div>
                <div style={{ fontSize: 12, color: "#666" }}>{item.shopName} · {item.category} · ¥{item.price}</div>
                {item.shopId?.startsWith("PENDING_") && (
                  <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 2 }}>⚠ PENDING（Places未設定）</div>
                )}
              </div>
              <button onClick={() => openEdit(item)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontSize: 12 }}>編集</button>
              <button onClick={() => handleDelete(item.id)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #fee2e2", background: "#fff", cursor: "pointer", fontSize: 12, color: "#ef4444" }}>削除</button>
            </div>
          ))}
        </div>
      )}

      {/* 座標修正タブ */}
      {tab === "fix" && (
        <div style={{ padding: 16 }}>
          <div ref={bulkDivRef} style={{ width: 1, height: 1, position: "absolute", opacity: 0 }} />

          {pendingItems.length === 0 ? (
            <div style={{ textAlign: "center", color: "#aaa", padding: 40, fontSize: 14 }}>PENDING件数: 0件</div>
          ) : (
            <>
              {/* 一括修正エリア */}
              <div style={{ background: "#fff", borderRadius: 12, padding: 16, marginBottom: 16, border: "1px solid #eee" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <button
                    onClick={handleBulkFix}
                    disabled={bulkFixing || !mapsReady}
                    style={{
                      padding: "10px 20px", borderRadius: 10, border: "none",
                      background: bulkFixing ? "#ddd" : "#111",
                      color: bulkFixing ? "#999" : "#fff",
                      fontSize: 14, fontWeight: 700, cursor: bulkFixing ? "default" : "pointer",
                    }}
                  >
                    ⚡ 一括自動修正
                  </button>
                  <span style={{ fontSize: 13, color: "#666" }}>
                    {!bulkProgress && `${pendingItems.length}件を一括修正`}
                    {bulkFixing && bulkProgress && `修正中... ${bulkProgress.done + bulkProgress.failed}/${bulkProgress.total}件完了`}
                    {!bulkFixing && bulkProgress && `✅ ${bulkProgress.done}件修正完了${bulkProgress.failed > 0 ? `（${bulkProgress.failed}件失敗）` : ""}`}
                  </span>
                </div>
                {bulkFixing && bulkProgress && (
                  <div style={{ marginTop: 10, background: "#f5f5f5", borderRadius: 6, height: 6, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", background: "#111", borderRadius: 6,
                      width: `${((bulkProgress.done + bulkProgress.failed) / bulkProgress.total) * 100}%`,
                      transition: "width 0.3s",
                    }} />
                  </div>
                )}
              </div>

              {/* 手動修正リスト */}
              {pendingItems.map((item) => (
                <PendingItem key={item.id} item={item} mapsReady={mapsReady} onSaved={loadItems} />
              ))}
            </>
          )}
        </div>
      )}

      {/* 編集フォーム */}
      {tab === "edit" && (
        <div style={{ padding: 16, maxWidth: 600, margin: "0 auto" }}>
          {msg && <div style={{ padding: "10px 16px", background: "#d1fae5", borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{msg}</div>}

          <Field label="店名">
            <input type="text" value={form.shopName} onChange={(e) => setF("shopName", e.target.value)} style={inputStyle} />
          </Field>
          <Field label="shopId">
            <input type="text" value={form.shopId} onChange={(e) => setF("shopId", e.target.value)} style={inputStyle} />
          </Field>
          <Field label="商品名 *">
            <input type="text" value={form.productName} onChange={(e) => setF("productName", e.target.value)} style={inputStyle} />
          </Field>
          <Field label="キャッチコピー">
            <textarea value={form.catchphrase} onChange={(e) => setF("catchphrase", e.target.value)} style={{ ...inputStyle, height: 72, resize: "vertical" }} />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Field label="価格"><input type="number" value={form.price} onChange={(e) => setF("price", e.target.value)} style={inputStyle} /></Field>
            <Field label="カテゴリ">
              <select value={form.category} onChange={(e) => setF("category", e.target.value)} style={inputStyle}>
                {CATEGORY_LIST.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="エリア"><input type="text" value={form.area} onChange={(e) => setF("area", e.target.value)} style={inputStyle} /></Field>
            <Field label="都道府県"><input type="text" value={form.prefecture} onChange={(e) => setF("prefecture", e.target.value)} style={inputStyle} /></Field>
          </div>

          <Field label="住所"><input type="text" value={form.address} onChange={(e) => setF("address", e.target.value)} style={inputStyle} /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Field label="緯度"><input type="text" value={form.location.lat} onChange={(e) => setForm((f) => ({ ...f, location: { ...f.location, lat: e.target.value } }))} style={inputStyle} /></Field>
            <Field label="経度"><input type="text" value={form.location.lng} onChange={(e) => setForm((f) => ({ ...f, location: { ...f.location, lng: e.target.value } }))} style={inputStyle} /></Field>
          </div>
          <Field label="電話"><input type="text" value={form.phone || ""} onChange={(e) => setF("phone", e.target.value)} style={inputStyle} /></Field>
          <Field label="営業時間"><input type="text" value={form.hours || ""} onChange={(e) => setF("hours", e.target.value)} style={inputStyle} /></Field>
          <Field label="定休日"><input type="text" value={form.holiday || ""} onChange={(e) => setF("holiday", e.target.value)} style={inputStyle} /></Field>

          <Field label="フラグ">
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {[["hasTrashCan","ゴミ箱あり"],["isPremium","プレミアム"],["isAd","広告"],["verified","確認済"]].map(([k, l]) => (
                <label key={k} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={!!form[k]} onChange={(e) => setF(k, e.target.checked)} />
                  {l}
                </label>
              ))}
            </div>
          </Field>

          <button onClick={handleSave} disabled={saving} style={{
            width: "100%", padding: "14px 0", borderRadius: 12,
            background: "#111", color: "#fff", border: "none",
            fontSize: 15, fontWeight: 700, cursor: "pointer", marginTop: 8,
          }}>
            {saving ? "保存中..." : editing ? "更新する" : "追加する"}
          </button>
        </div>
      )}
    </div>
  );
}

function PendingItem({ item, mapsReady, onSaved }) {
  const inputRef = useRef(null);
  const acRef = useRef(null);
  const [data, setData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!mapsReady || !inputRef.current || acRef.current) return;
    const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
      language: "ja", types: ["establishment"],
    });
    acRef.current = ac;
    ac.addListener("place_changed", () => {
      const place = ac.getPlace();
      if (!place?.geometry) return;
      const hours = place.opening_hours?.weekday_text?.join(" / ") || null;
      setData({
        shopId: place.place_id,
        shopName: place.name || item.shopName,
        address: place.formatted_address || item.address,
        phone: place.formatted_phone_number || item.phone || null,
        hours: hours || item.hours || null,
        location: {
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
        },
      });
    });
  }, [mapsReady]);

  async function handleSave() {
    if (!data) return;
    setSaving(true);
    await updateDoc(doc(db, "items", item.id), data);
    setSaving(false);
    setDone(true);
    onSaved();
  }

  if (done) return null;

  return (
    <div style={{
      background: "#fff", borderRadius: 10, padding: 16, marginBottom: 10,
      border: "1px solid #f59e0b",
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{item.productName}</div>
      <div style={{ fontSize: 12, color: "#888", marginBottom: 10 }}>{item.shopName} · {item.area}</div>

      <input
        ref={inputRef}
        type="text"
        defaultValue={item.shopName}
        placeholder="店名で検索..."
        style={{ ...inputStyle, marginBottom: 8 }}
      />

      {data && (
        <div style={{ background: "#f0fdf4", borderRadius: 8, padding: "8px 12px", marginBottom: 8, fontSize: 12, color: "#166534" }}>
          <div>📍 {data.address}</div>
          {data.phone && <div>📞 {data.phone}</div>}
          {data.hours && <div>🕐 {data.hours.slice(0, 60)}...</div>}
          <div style={{ color: "#666", marginTop: 4 }}>lat: {data.location.lat.toFixed(6)}, lng: {data.location.lng.toFixed(6)}</div>
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={!data || saving}
        style={{
          padding: "8px 20px", borderRadius: 8, border: "none",
          background: data ? "#111" : "#ddd",
          color: data ? "#fff" : "#999",
          fontSize: 13, fontWeight: 700, cursor: data ? "pointer" : "default",
        }}
      >
        {saving ? "保存中..." : "保存"}
      </button>
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
