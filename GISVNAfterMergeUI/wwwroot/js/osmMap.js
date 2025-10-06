window._osmMaps = window._osmMaps || {};

window.initMapAndLoadData = async function(apiUrl, mapDivId = 'map') {
    const el = document.getElementById(mapDivId);
    if (!el) {
        console.error('Element not found:', mapDivId);
        return;
    }

    if (window._osmMaps[mapDivId]) {
        console.warn('Map already initialized for', mapDivId);
        return;
    }

    const map = L.map(el).setView([16.0471, 108.2068], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    const state = { map, layers: [] };
    window._osmMaps[mapDivId] = state;

    try {
        const res = await fetch(`https://localhost:7001${apiUrl}`);
        const json = await res.json();
        if (!json.data) return;

        json.data.forEach(province => {
            const provGeom = JSON.parse(province.boundary);
            const provLayer = drawGeometryCollection(provGeom, map, {
                color: 'blue', weight: 2, fillOpacity: 0.08
            });

            provLayer.bindPopup(`<b>${province.name}</b>`);
            provLayer._meta = { 
                id: province.id, 
                name: province.name.toLowerCase(), 
                legacyId: province.legacyId
            };

            (province.communes || []).forEach(c => {
                const cGeom = JSON.parse(c.boundary);
                const cLayer = drawGeometryCollection(cGeom, map, {
                    color: 'green', weight: 1, fillOpacity: 0.25
                });
                cLayer.bindPopup(`<b>${c.name}</b><br/>Dân số: ${c.population} người<br/>Diện tích: ${c.area} km2`);
                cLayer._meta = {
                    id: c.id,
                    name: c.name.toLowerCase(),
                    legacyId: c.legacyId
                };
                
                state.layers.push(cLayer);
            });

            state.layers.push(provLayer);
        });

        // Fit toàn bản đồ
        const group = L.featureGroup(state.layers);
        const bounds = group.getBounds();
        if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [20, 20] });
        }
    } catch (e) {
        console.error('Error loading geo data', e);
    }
};

// ✅ Hàm tìm kiếm và highlight
window.highlightProvince = function(searchText, mapDivId = 'map') {
    const state = window._osmMaps[mapDivId];
    if (!state) return;

    const query = searchText.toLowerCase();
    let found = null;
    
    console.log({ query });
    
    // reset màu
    state.layers.forEach(l => l.setStyle && l.setStyle({ color: l._meta?.color || 'blue' }));
    for (const l of state.layers) {
        if (!l._meta) continue;
        if (l._meta.name.includes(query) || 
            l._meta.id?.toString() === query || 
            l._meta.legacyId?.toString() === query) 
        {
            found = l;
            break;
        }
    }

    if (found) {
        found.setStyle({ color: 'red', weight: 4 });
        setTimeout(() => {
            found.setStyle({ color: 'blue', weight: 2 });
        }, 3000);
        
        const bounds = found.getBounds();
        if (bounds.isValid()) state.map.fitBounds(bounds, { padding: [30, 30] });
        found.openPopup();
    } else {
        console.warn("Không tìm thấy tỉnh/thành:", searchText);
    }
};

function drawGeometryCollection(geometryCollection, map, style) {
    const group = L.featureGroup();
    if (geometryCollection?.type === "GeometryCollection") {
        geometryCollection.geometries.forEach(geom => {
            if (geom.type === "Polygon") {
                const polys = geom.coordinates.map(ring => ring.map(c => [c[1], c[0]]));
                L.polygon(polys, style).addTo(group);
            } else if (geom.type === "MultiPolygon") {
                geom.coordinates.forEach(poly => {
                    const polys = poly.map(ring => ring.map(c => [c[1], c[0]]));
                    L.polygon(polys, style).addTo(group);
                });
            }
        });
    }
    group.addTo(map);
    return group;
}

window.disposeMap = function(mapDivId = 'map') {
    const state = window._osmMaps[mapDivId];
    if (!state) return;
    try { state.map.remove(); } catch { }
    delete window._osmMaps[mapDivId];
};
