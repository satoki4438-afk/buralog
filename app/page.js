"use client";
import { useEffect, useRef, useState, useCallback, forwardRef } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CATEGORIES, CATEGORY_LIST } from "@/lib/categories";
import ItemModal from "@/components/ItemModal";
import AdTicker from "@/components/AdTicker";

export default function Home() {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);

  const [items, setItems] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [activeItem, setActiveItem] = useState(null);
  const [mode, setMode] = useState("loading");
  const [searchInput, setSearchInput] = useState("");
  const [mapsReady, setMapsReady] = useState(false);
  const cardRefs = useRef({});

  useEffect(() => {
    getDocs(collection(db, "items")).then((snap) => {
      const data = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      setItems(data);
      setFiltered(data);
    });
  }, []);

  useEffect(() => {
    if (window.google) { setMapsReady(true); return; }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places&language=ja`;
    script.async = true;
    script.onload = () => setMapsReady(true);
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!mapsReady) return;
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        initMap({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setMode("gps");
      },
      () => setMode("travel")
    ) ?? setMode("travel");
  }, [mapsReady]);

  useEffect(() => {
    if (mode !== "travel" || !mapsReady) return;
    initMap({ lat: 26.2124, lng: 127.6792 });
    const input = document.getElementById("travel-search");
    if (!input) return;
    const ac = new window.google.maps.places.Autocomplete(input, { language: "ja" });
    ac.addListener("place_changed", () => {
      const place = ac.getPlace();
      if (!place.geometry) return;
      mapInstanceRef.current?.panTo(place.geometry.location);
      mapInstanceRef.current?.setZoom(14);
    });
  }, [mode, mapsReady]);

  function initMap(center) {
    if (!mapRef.current || mapInstanceRef.current) return;
    mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
      center,
      zoom: 14,
      disableDefaultUI: true,
      zoomControl: true,
    });
  }

  useEffect(() => {
    if (!mapInstanceRef.current) return;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    filtered.forEach((item) => {
      if (!item.location?.lat) return;
      const color = CATEGORIES[item.category]?.color || "#999";
      const isActive = activeItem?.id === item.id;
      const size = isActive ? 44 : 36;
      const svg = `<svg width="${size}" height="${size}" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg"><circle cx="18" cy="18" r="16" fill="${color}" stroke="white" stroke-width="3"/>${isActive ? `<circle cx="18" cy="18" r="20" fill="none" stroke="${color}" stroke-width="2" opacity="0.4"/>` : ""}</svg>`;
      const marker = new window.google.maps.Marker({
        position: { lat: item.location.lat, lng: item.location.lng },
        map: mapInstanceRef.current,
        icon: {
          url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
          scaledSize: new window.google.maps.Size(size, size),
          anchor: new window.google.maps.Point(size / 2, size / 2),
        },
        zIndex: isActive ? 100 : 1,
      });
      marker.addListener("click", () => {
        setActiveItem(item);
        cardRefs.current[item.id]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
      markersRef.current.push(marker);
    });
  }, [filtered, activeItem]);

  useEffect(() => {
    setFiltered(selectedCategory ? items.filter((i) => i.category === selectedCategory) : items);
    setActiveItem(null);
  }, [selectedCategory, items]);

  const handleCardClick = useCallback((item) => {
    setActiveItem(item);
    if (item.location?.lat && mapInstanceRef.current) {
      mapInstanceRef.current.panTo({ lat: item.location.lat, lng: item.location.lng });
    }
  }, []);

  const adItems = items.filter((i) => i.isAd);
  const displayItems = filtered.filter((i) => !i.isAd);

  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* 地図 */}
      <div style={{ position: "relative", flex: "0 0 45%" }}>
        <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
        {mode === "travel" && (
          <div style={{ position: "absolute", top: 12, left: 12, right: 12, zIndex: 10 }}>
            <input
              id="travel-search"
              type="text"
              placeholder="エリアを検索（例：那覇市、沖縄県）"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              style={{
                width: "100%", padding: "10px 16px", borderRadius: 24,
                border: "none", boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                fontSize: 14, outline: "none",
              }}
            />
          </div>
        )}
        {mode === "loading" && (
          <div style={{
            position: "absolute", inset: 0, background: "#f8f8f8",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <div style={{ color: "#999", fontSize: 14 }}>地図を読み込み中...</div>
          </div>
        )}
      </div>

      {/* カテゴリバー */}
      <div style={{
        display: "flex", overflowX: "auto", gap: 8, padding: "8px 12px",
        background: "#fff", borderBottom: "1px solid #eee", flexShrink: 0,
      }} className="hide-scrollbar">
        <button
          onClick={() => setSelectedCategory(null)}
          style={{
            flexShrink: 0, padding: "4px 12px", borderRadius: 20,
            border: "1px solid #ddd", fontSize: 12, cursor: "pointer",
            background: !selectedCategory ? "#111" : "#fff",
            color: !selectedCategory ? "#fff" : "#333",
          }}
        >
          すべて
        </button>
        {CATEGORY_LIST.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
            style={{
              flexShrink: 0, padding: "4px 12px", borderRadius: 20, fontSize: 12,
              cursor: "pointer",
              border: `1px solid ${CATEGORIES[cat].color}`,
              background: selectedCategory === cat ? CATEGORIES[cat].color : CATEGORIES[cat].bg,
              color: selectedCategory === cat ? "#fff" : CATEGORIES[cat].color,
              fontWeight: selectedCategory === cat ? 700 : 400,
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* カードリスト */}
      <div style={{ flex: 1, overflowY: "auto" }} className="hide-scrollbar">
        {displayItems.length === 0 ? (
          <div style={{ textAlign: "center", color: "#aaa", padding: 32, fontSize: 14 }}>
            この条件の商品がありません
          </div>
        ) : (
          displayItems.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              isActive={activeItem?.id === item.id}
              onClick={() => handleCardClick(item)}
              onDetail={() => setSelectedItem(item)}
              ref={(el) => { cardRefs.current[item.id] = el; }}
            />
          ))
        )}
      </div>

      {adItems.length > 0 && <AdTicker items={adItems} onDetail={setSelectedItem} />}
      {selectedItem && <ItemModal item={selectedItem} onClose={() => setSelectedItem(null)} />}
    </div>
  );
}

const ItemCard = forwardRef(function ItemCard({ item, isActive, onClick, onDetail }, ref) {
  const color = CATEGORIES[item.category]?.color || "#999";
  const bg = CATEGORIES[item.category]?.bg || "#f5f5f5";
  return (
    <div
      ref={ref}
      onClick={onClick}
      style={{
        display: "flex", gap: 12, padding: "10px 16px",
        background: isActive ? "#fffbea" : "#fff",
        borderLeft: isActive ? `4px solid ${color}` : "4px solid transparent",
        borderBottom: "1px solid #f0f0f0",
        cursor: "pointer",
      }}
    >
      <div style={{
        width: 64, height: 64, borderRadius: 10, flexShrink: 0,
        background: bg, display: "flex", alignItems: "center", justifyContent: "center",
        overflow: "hidden",
      }}>
        {item.imageUrls?.[0]
          ? <img src={item.imageUrls[0]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <span style={{ fontSize: 24 }}>🍽️</span>
        }
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: 10, padding: "1px 8px", borderRadius: 10, background: bg, color, fontWeight: 600 }}>
            {item.category}
          </span>
          <span style={{ fontSize: 11, color: "#999" }}>{item.area}</span>
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#111", marginBottom: 2 }}>{item.productName}</div>
        <div style={{ fontSize: 12, color: "#666", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {item.shopName}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#e85" }}>¥{item.price?.toLocaleString()}</span>
          <button
            onClick={(e) => { e.stopPropagation(); onDetail(); }}
            style={{
              fontSize: 11, padding: "3px 10px", borderRadius: 12,
              border: `1px solid ${color}`, color, background: "transparent", cursor: "pointer",
            }}
          >
            詳細
          </button>
        </div>
      </div>
    </div>
  );
});
