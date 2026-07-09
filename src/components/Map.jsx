import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, GeoJSON, useMap, Polygon } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { scaleSequential } from 'd3-scale';
import { interpolateSinebow } from 'd3-scale-chromatic';
import * as turf from '@turf/turf';

// ==============================
// --- 辅助函数 (无变化) ---
const colorScale = scaleSequential(interpolateSinebow);

function getColorfulColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0;
  }
  const normalized = (Math.abs(hash) % 1000) / 1000;
  return colorScale(normalized);
}

// ==============================
// --- 地名标签显隐阈值 ---
const CITY_LABEL_MIN_PX = 45;
const PROVINCE_LABEL_MIN_PX = 35;
const MIN_LABEL_AREA = 1600;

// 判断某 polygon 的屏幕投影是否够大、能放下名字标签
function shouldShowLabel(widthPx, heightPx, minPx) {
  return Math.min(widthPx, heightPx) >= minPx && widthPx * heightPx >= MIN_LABEL_AREA;
}

// ==============================
// --- 缩放处理组件 (无变化) ---
function ZoomHandler({ setActiveLayer, ZOOM_THRESHOLD, isZoomSwitchEnabled }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const handleZoomEnd = () => {
      if (!isZoomSwitchEnabled) return;
      const currentZoom = map.getZoom();
      setActiveLayer(prev => {
        if (currentZoom < ZOOM_THRESHOLD && prev !== 'province') return 'province';
        if (currentZoom >= ZOOM_THRESHOLD && prev !== 'city') return 'city';
        return prev;
      });
    };
    const initialOrToggleCheck = () => {
      if (isZoomSwitchEnabled) {
        const currentZoom = map.getZoom();
        setActiveLayer(currentZoom < ZOOM_THRESHOLD ? 'province' : 'city');
      } else {
        setActiveLayer('city');
      }
    };
    initialOrToggleCheck();
    map.on('zoomend', handleZoomEnd);
    return () => map.off('zoomend', handleZoomEnd);
  }, [map, setActiveLayer, ZOOM_THRESHOLD, isZoomSwitchEnabled]);
  return null;
}

// ==============================
// --- 地名标签显隐管理 (按 polygon 屏幕投影大小动态 toggle permanent tooltip) ---
function LabelVisibilityManager({ activeLayer }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const minPx = activeLayer === 'city' ? CITY_LABEL_MIN_PX : PROVINCE_LABEL_MIN_PX;

    const evaluate = () => {
      map.eachLayer(layer => {
        if (typeof layer.getTooltip !== 'function') return;
        const tooltip = layer.getTooltip();
        if (!tooltip || !tooltip.options.permanent) return;
        if (typeof layer.getBounds !== 'function') return;
        const bounds = layer.getBounds();
        const sw = map.latLngToContainerPoint(bounds.getSouthWest());
        const ne = map.latLngToContainerPoint(bounds.getNorthEast());
        const w = Math.abs(ne.x - sw.x);
        const h = Math.abs(ne.y - sw.y);
        if (shouldShowLabel(w, h, minPx)) {
          if (!tooltip.isOpen()) layer.openTooltip();
        } else {
          if (tooltip.isOpen()) layer.closeTooltip();
        }
      });
    };

    // 初始评估延一帧，确保省/市 polygon 已挂载
    const raf = requestAnimationFrame(evaluate);
    map.on('zoomend', evaluate);

    let moveTimer = null;
    const onMoveEnd = () => {
      if (moveTimer) clearTimeout(moveTimer);
      moveTimer = setTimeout(evaluate, 50);
    };
    map.on('moveend', onMoveEnd);

    const onLayerAdd = () => {
      if (moveTimer) clearTimeout(moveTimer);
      moveTimer = setTimeout(evaluate, 50);
    };
    map.on('layeradd', onLayerAdd);

    return () => {
      cancelAnimationFrame(raf);
      map.off('zoomend', evaluate);
      map.off('moveend', onMoveEnd);
      map.off('layeradd', onLayerAdd);
      if (moveTimer) clearTimeout(moveTimer);
    };
  }, [map, activeLayer]);
  return null;
}

// ==============================
// --- 省份多边形组件 (无变化) ---
const ProvincePolygon = ({ feature, progressData, onProvinceClick, colorMode, globalWaterLat }) => {
  const provinceName = feature.properties.name;
  const lineRgb = getComputedStyle(document.documentElement).getPropertyValue('--map-line-color-rgb').trim();

  let fullPositions = [];
  if (feature.geometry.type === 'Polygon') {
    fullPositions = L.GeoJSON.coordsToLatLngs(feature.geometry.coordinates, 1);
  } else if (feature.geometry.type === 'MultiPolygon') {
    fullPositions = feature.geometry.coordinates.map(polygon => L.GeoJSON.coordsToLatLngs(polygon, 1));
  }

  let tooltipText = provinceName;
  if (progressData && progressData.cities) {
    const totalCities = progressData.cities.size || 0;
    const visitedCities = [...progressData.cities.values()].filter(Boolean).length;
    if (totalCities > 0) {
      tooltipText += ` (${visitedCities}/${totalCities})`;
    }
  }

  const latestTooltipText = useRef(tooltipText);
  latestTooltipText.current = tooltipText;

  // 在省 polygon 上绑常驻省名标签；hover 时切到「省名 + 进度」，移出还原
  const bindProvinceLabel = (layer) => {
    if (!layer || layer._labelBound) return;
    layer._labelBound = true;
    layer.bindTooltip(provinceName, { className: 'map-label', permanent: true, direction: 'center' });
    layer.closeTooltip();
    layer.on('mouseover', () => {
      const t = layer.getTooltip();
      if (t) t.setContent(latestTooltipText.current);
    });
    layer.on('mouseout', () => {
      const t = layer.getTooltip();
      if (t) t.setContent(provinceName);
    });
  };

  if (colorMode === 'single') {
    const provinceOwnProgress = progressData?.progress ?? 0;
    if (provinceOwnProgress <= 0) {
      return (
        <Polygon positions={fullPositions} pathOptions={{ color: `rgb(${lineRgb})`, weight: 0.5, fillColor: 'transparent' }} ref={bindProvinceLabel} eventHandlers={{ click: () => onProvinceClick(feature) }} />
      );
    }
    const minColor = [202, 240, 248], maxColor = [0, 180, 216];
    let p_remapped = 0;
    if (provinceOwnProgress > 0.5) p_remapped = (provinceOwnProgress - 0.5) * 2;
    const p_final = Math.pow(p_remapped, 0.6);
    const interpolateColor = minColor.map((start, i) => Math.round(start + (maxColor[i] - start) * p_final));
    const fillColor = `rgb(${interpolateColor.join(',')})`;
    return (
      <Polygon positions={fullPositions} pathOptions={{ color: `rgb(${lineRgb})`, weight: 0.5, fillColor, fillOpacity: 1 }} ref={bindProvinceLabel} eventHandlers={{ click: () => onProvinceClick(feature) }} />
    );
  }

  if (colorMode === 'colorful') {
    let waterPositions = [];
    if (globalWaterLat > 20) {
      try {
        const bbox = turf.bbox(feature);
        const [minLng, minLat, maxLng, maxLat] = bbox;
        const waterLatForClipping = Math.min(globalWaterLat, maxLat);
        if (waterLatForClipping > minLat) {
          const clipBbox = [minLng, minLat, maxLng, waterLatForClipping];
          const clippedFeature = turf.bboxClip(feature, clipBbox);
          if (clippedFeature.geometry.type === 'Polygon') {
            waterPositions = L.GeoJSON.coordsToLatLngs(clippedFeature.geometry.coordinates, 1);
          } else if (clippedFeature.geometry.type === 'MultiPolygon') {
            waterPositions = clippedFeature.geometry.coordinates.map(p => L.GeoJSON.coordsToLatLngs(p, 1));
          }
        }
      } catch (e) { console.error('Province water clip error:', provinceName, e); }
    }
    return (
      <>
        {waterPositions.length > 0 && (
          <Polygon positions={waterPositions} pathOptions={{ color: 'transparent', weight: 0, fillColor: '#00b4d8', fillOpacity: 0.7 }} />
        )}
        <Polygon positions={fullPositions} pathOptions={{ color: `rgb(${lineRgb})`, weight: 0.5, fillColor: 'transparent' }} ref={bindProvinceLabel} eventHandlers={{ click: () => onProvinceClick(feature) }} />
      </>
    );
  }
  return null;
};

// ==============================
// --- 主 Map 组件 ---
function Map({
  cityGeojsonData, provinceGeojsonData, selectedCities, setCityLayers,
  onCityClick, onProvinceClick, colorMode, provinceProgress, onMapLoad,
  isZoomSwitchEnabled, globalWaterLat
}) {
  const [activeLayer, setActiveLayer] = useState('city');
  const cityGeoJsonRef = useRef(null);
  const ZOOM_THRESHOLD = 5;

  function MapInstanceSetter() {
    const map = useMap();
    useEffect(() => { if (map) onMapLoad(map); }, [map]);
    return null;
  }

  useEffect(() => {
    if (activeLayer === 'city' && cityGeoJsonRef.current) {
      const layersMap = {};
      cityGeoJsonRef.current.eachLayer(layer => { layersMap[layer.feature.properties.name] = layer; });
      setCityLayers(layersMap);
    } else {
      setCityLayers({});
    }
  }, [activeLayer, cityGeojsonData, setCityLayers]);

  const onEachCityFeature = (feature, layer) => {
    const name = feature.properties.name;

    // 常驻名字标签（由 LabelVisibilityManager 按图块大小动态显隐）
    layer.bindTooltip(name, {
      className: 'map-label',
      permanent: true,
      direction: 'center',
    });
    layer.closeTooltip(); // 初始隐藏，等 LabelVisibilityManager 评估

    layer.on({
      // 鼠标移入：仅未点亮的城市提高不透明度作高亮
      mouseover: (e) => {
        if (!selectedCities.has(name)) {
          e.target.setStyle({ fillOpacity: 0.4 });
        }
      },
      // 鼠标移出：恢复样式
      mouseout: (e) => {
        if (!selectedCities.has(name)) {
          cityGeoJsonRef.current.resetStyle(e.target);
        }
      },
      // 点击：切换点亮
      click: () => {
        onCityClick(name);
      },
    });
  };

  return (
    <MapContainer center={[35, 105]} zoom={4} style={{ height: '100%', width: '100%' }} zoomControl={false} attributionControl={false}>
      <MapInstanceSetter />
      <ZoomHandler setActiveLayer={setActiveLayer} ZOOM_THRESHOLD={ZOOM_THRESHOLD} isZoomSwitchEnabled={isZoomSwitchEnabled} />
      <LabelVisibilityManager activeLayer={activeLayer} />
      {/* 城市层 */}
      {cityGeojsonData && (!isZoomSwitchEnabled || activeLayer === 'city') && (
        <GeoJSON
          ref={cityGeoJsonRef}
          key={'city-' + [...selectedCities].join(',') + colorMode}
          data={cityGeojsonData}
          style={feature => ({
            color: `rgb(${getComputedStyle(document.documentElement).getPropertyValue('--map-line-color-rgb').trim()})`,
            weight: 0.5,
            // 初始样式：已点亮的城市有 0.6 的不透明度，未点亮的为 0
            fillOpacity: selectedCities.has(feature.properties.name) ? 0.6 : 0,
            fillColor: colorMode === 'single' ? '#48cae4' : getColorfulColor(feature.properties.name),
          })}
          onEachFeature={onEachCityFeature} // 应用我们修改过的事件处理器
        />
      )}
      {/* 省份层 */}
      {provinceGeojsonData && isZoomSwitchEnabled && activeLayer === 'province' && (
        <>
          {provinceGeojsonData.features.map((feature, index) => (
            <ProvincePolygon
              key={`${feature.properties.name}-${index}`}
              feature={feature}
              progressData={provinceProgress.get(feature.properties.name)}
              onProvinceClick={onProvinceClick}
              colorMode={colorMode}
              globalWaterLat={globalWaterLat}
            />
          ))}
        </>
      )}
    </MapContainer>
  );
}

export default Map;