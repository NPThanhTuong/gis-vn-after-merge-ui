window._osmMaps = window._osmMaps || {};

window.initMapAndLoadData = async function(
    provinceUrl, 
    communeUrl, 
    mapDivId = 'map', 
    isCommuneVisible
) {
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
    map.invalidateSize();
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    const state = { map, layers: { provinces: null, communes : null } };
    window._osmMaps[mapDivId] = state;

    // Hàm tải dữ liệu GeoJSON
    async function loadGeoData(apiUrl, style) {
        try {
            const res = await fetch(`https://localhost:7001${apiUrl}`);
            if (!res.ok) {
                console.error('API error:', res.status, res.statusText);
                return null;
            }
            const json = await res.json();
            if (!json) {
                console.warn('No GeoJSON data received from', apiUrl);
                return null;
            }
            
            // Log một phần dữ liệu để kiểm tra
            console.log(`GeoJSON from ${apiUrl} - Feature count:`, json.features?.length || 0);
            console.log('First feature:', json.features?.[0] || 'No features');
            
            return drawGeometryCollection(json, map, style);
        } catch (e) {
            console.error('Error loading geo data from', apiUrl, e);
            return null;
        }
    }

    try {
        // Tải lớp tỉnh/thành phố
        state.layers.provinces = await loadGeoData(provinceUrl, {
            weight: 2,
            // fillOpacity: 0.08
        });

        // Tải lớp phường/xã (mặc định hiển thị)
        state.layers.communes = await loadGeoData(communeUrl, {
            weight: 1,
            // fillOpacity: 0.2 // Tăng độ trong suốt để phân biệt với tỉnh
        });

        if(!isCommuneVisible)
            state.map.removeLayer(state.layers.communes);

        // Tính bounds cho toàn bộ bản đồ (bao gồm cả tỉnh và phường/xã nếu có)
        const allLayers = [];
        if (state.layers.provinces && state.layers.provinces.getLayers().length > 0) {
            allLayers.push(state.layers.provinces);
        }
        
        if (state.layers.communes && 
            state.layers.communes.getLayers().length > 0
        ) {
            allLayers.push(state.layers.communes);
        }

        if (allLayers.length > 0) {
            const group = L.featureGroup(allLayers);
            const bounds = group.getBounds();
            if (bounds.isValid()) {
                map.fitBounds(bounds, { padding: [20, 20] });
            } else {
                console.warn('Invalid bounds for feature group');
            }
        } else {
            console.warn('No valid layers to display');
        }
    } catch (e) {
        console.error('Error loading geo data', e);
    }
};

// Hàm bật/tắt lớp phường/xã
window.toggleCommuneLayer = function(mapDivId, isVisible) {
    const state = window._osmMaps[mapDivId];
    if (!state || !state.map) { 
        console.error('Map not initialized for', mapDivId);
        return;
    }

    const communeLayer = state.layers.communes;
    const provinceLayer = state.layers.provinces;
    if (communeLayer) {
        if (isVisible) {
            if (!state.map.hasLayer(communeLayer)) {
                state.map.removeLayer(provinceLayer);
                communeLayer.addTo(state.map);
                console.log('Ward layer added to map');
            }
        } else {
            if (state.map.hasLayer(communeLayer)) {
                state.map.removeLayer(communeLayer);
                provinceLayer.addTo(state.map);
                console.log('Ward layer removed from map');
            }
        }
    } else {
        console.warn('Ward layer not available');
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

// Hàm tạo màu ngẫu nhiên
function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

// Hàm tạo màu dựa trên tên tỉnh (hoặc thuộc tính khác)
function getColorForFeature(feature) {
    // Nếu có thuộc tính cụ thể để xác định màu, ví dụ: properties.type
    if (feature.properties && feature.properties.type) {
        const type = feature.properties.type;
        const colorMap = {
            'type1': '#FF0000', // Đỏ
            'type2': '#00FF00', // Xanh lá
            'type3': '#0000FF'  // Xanh dương
            // Thêm các loại khác nếu cần
        };
        return colorMap[type] || getRandomColor(); // Mặc định là màu ngẫu nhiên
    }
    // Nếu không có thuộc tính, trả về màu ngẫu nhiên
    return getRandomColor();
}

function drawGeometryCollection(geojson, map, style) {
    const group = L.featureGroup();

    // Kiểm tra xem dữ liệu GeoJSON có hợp lệ không
    if (!geojson || !geojson.type) {
        console.error('Invalid GeoJSON data');
        return group;
    }

    // Xử lý FeatureCollection
    if (geojson.type === 'FeatureCollection') {
        const geoJsonLayer = L.geoJSON(geojson, {
            style: function(feature) {
                return {
                    color: getColorForFeature(feature), // Màu viền
                    weight: style.weight || 2,
                    fillColor: getColorForFeature(feature), // Màu nền
                    fillOpacity: style.fillOpacity || 1
                };
            },
            onEachFeature: function(feature, layer) {
                // Tạo nội dung popup từ properties
                if (feature.properties) {
                    const props = feature.properties;
                    const popupContent = `
                        <b>Mã số hiện hành:</b> ${feature.id || 'Không mã số'}<br>
                        <b>Mã số cũ:</b> ${props.legacyId || 'Không mã số'}<br>
                        <b>Tên:</b> ${props.name || 'Không có tên'}<br>
                    `;
                    layer.bindPopup(popupContent);
                } else {
                    layer.bindPopup('Không có thông tin');
                }
            },
            coordsToLatLng: function(coords) {
                return [coords[1], coords[0]]; // Chuyển đổi [longitude, latitude] thành [latitude, longitude]
            }
        });
        geoJsonLayer.addTo(group);
    }
    // Xử lý GeometryCollection
    else if (geojson.type === 'GeometryCollection') {
        geojson.geometries.forEach(geom => {
            if (geom.type === 'Polygon') {
                const polys = geom.coordinates.map(ring => ring.map(c => [c[1], c[0]]));
                L.polygon(polys, style).addTo(group);
            } else if (geom.type === 'MultiPolygon') {
                geom.coordinates.forEach(poly => {
                    const polys = poly.map(ring => ring.map(c => [c[1], c[0]]));
                    L.polygon(polys, style).addTo(group);
                });
            } else {
                console.warn(`Unsupported geometry type: ${geom.type}`);
            }
        });
    }
    // Xử lý Feature đơn lẻ
    else if (geojson.type === 'Feature' && geojson.geometry) {
        const geom = geojson.geometry;
        if (geom.type === 'Polygon') {
            const polys = geom.coordinates.map(ring => ring.map(c => [c[1], c[0]]));
            const layer = L.polygon(polys, style);
            if (geojson.properties) {
                const props = geojson.properties;
                const popupContent = `
                    <b>Mã số hiện hành:</b> ${feature.id || 'Không mã số'}<br>
                    <b>Mã số cũ:</b> ${props.legacyId || 'Không mã số'}<br>
                    <b>Tên:</b> ${props.name || 'Không có tên'}<br>
                `;
                layer.bindPopup(popupContent);
            }
            layer.addTo(group);
        } else if (geom.type === 'MultiPolygon') {
            geom.coordinates.forEach(poly => {
                const polys = poly.map(ring => ring.map(c => [c[1], c[0]]));
                const layer = L.polygon(polys, style);
                if (geojson.properties) {
                    const props = geojson.properties;
                    const popupContent = `
                        <b>Mã số hiện hành:</b> ${feature.id || 'Không mã số'}<br>
                        <b>Mã số cũ:</b> ${props.legacyId || 'Không mã số'}<br>
                        <b>Tên:</b> ${props.name || 'Không có tên'}<br>
                    `;
                    layer.bindPopup(popupContent);
                }
                layer.addTo(group);
            });
        } else {
            console.warn(`Unsupported geometry type: ${geom.type}`);
        }
    }
    else {
        console.error(`Unsupported GeoJSON type: ${geojson.type}`);
    }

    // Thêm feature group vào bản đồ
    if (group.getLayers().length > 0) {
        group.addTo(map);
    } else {
        console.warn('No valid layers added to feature group');
    }

    return group;
}

window.disposeMap = function(mapDivId = 'map') {
    const state = window._osmMaps[mapDivId];
    if (!state) return;
    try { state.map.remove(); } catch { }
    delete window._osmMaps[mapDivId];
};
