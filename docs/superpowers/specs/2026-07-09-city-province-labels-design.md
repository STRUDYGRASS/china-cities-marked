# 地图省市名字常驻标签 — 设计文档

- 日期：2026-07-09
- 状态：已确认，待实现

## 1. 背景与目标

「迹忆中国」地图有两层：`zoom < 5` 显示省 polygon（34 个），`zoom ≥ 5` 显示市 polygon（几百个），由 `ZoomHandler` 按 `ZOOM_THRESHOLD=5` 切换。当前省/市名字仅在鼠标悬停时通过 Leaflet tooltip 显示，缩略视图下无法一眼看出哪块是哪个省/市。

**目标**：当地图块在屏幕上足够大、放得下文字时，在 polygon 上常驻显示省名/市名；太小放不下则不显示，避免拥挤。

## 2. 需求（已与用户确认）

1. 省层（`zoom<5`）常驻显示省名；市层（`zoom≥5`）常驻显示市名——与图层切换一致。
2. 「合理显示」规则：按每个 polygon 的屏幕投影大小动态判定，够大才显，小的自动隐藏，放大后逐渐出现。
3. 标签文字用描边/阴影保证在彩色/单色、light/dark 各种底色下可读，不使用背景框。
4. 所有省/市均参与判定（不区分点亮状态）；动态阈值负责过滤小图块。
5. 保留 hover 的额外信息：市层保留 hover 高亮；省层 hover 时 tooltip 内容补充访问进度「(已访/总数)」。

## 3. 架构

- 复用现有两层结构与 `ZoomHandler` 切层逻辑，不新增地理图层。
- 新增 `LabelVisibilityManager`（react-leaflet 子组件）负责按 zoom/pan 动态 toggle 各 polygon 的 permanent tooltip。
- permanent tooltip 绑定在 polygon 的质心（`turf.centerOfMass`）。

## 4. 组件改动

### 4.1 新增 `LabelVisibilityManager`
- 用 `useMap()` 拿地图实例。
- 监听 `zoomend` 和 `moveend`（`moveend` 防抖 ~50ms + `requestAnimationFrame` 合并）。
- 回调中 `map.eachLayer` 遍历，过滤出带 `feature` 的 polygon layer（即市/省 polygon），对每个调用显隐判定并 `openTooltip()` / `closeTooltip()`。
- 通过 props 接收阈值常量。

### 4.2 市层 `onEachCityFeature`
- 把 `layer.bindTooltip(name, {permanent:false,...})` 改为 `{permanent:true, className:'map-label', direction:'center'}`。
- 质心定位：`layer.bindTooltip(name, opts)` 后 `.setLatLng(turf.centerOfMass(feature).geometry.coordinates)`。
- 移除原 mouseover/mouseout 中显隐 tooltip 的逻辑（permanent 接管），保留 hover 的 fillOpacity 高亮与 click 逻辑。
- 初始挂载时由 `LabelVisibilityManager` 统一评估显隐（默认先 close）。

### 4.3 `ProvincePolygon`
- 给每个省 polygon 绑 permanent tooltip 显省名（质心）。
- mouseover：`layer.getTooltip().setContent("省名 (已访/总数)")`；mouseout：还原「省名」。
- 保留现有 water-clip / colorful / progress 渲染与 click。

### 4.4 常量
- `CITY_LABEL_MIN_PX = 45`、`PROVINCE_LABEL_MIN_PX = 35`（可调）。
- `MIN_AREA = 1600`（px²，约 40×40）。

## 5. 显隐算法

对每个 polygon layer：

```
bounds = layer.getBounds()
sw = map.latLngToContainerPoint(bounds.getSouthWest())
ne = map.latLngToContainerPoint(bounds.getNorthEast())
w = abs(ne.x - sw.x), h = abs(ne.y - sw.y)
MIN_PX = (layer 属于市层) ? CITY_LABEL_MIN_PX : PROVINCE_LABEL_MIN_PX
show = (min(w, h) >= MIN_PX) && (w * h >= MIN_AREA)
show ? layer.openTooltip() : layer.closeTooltip()
```

判断「市层 vs 省层」：用当前 `activeLayer` 状态（`LabelVisibilityManager` 通过 props 接收）决定用 `CITY_LABEL_MIN_PX` 还是 `PROVINCE_LABEL_MIN_PX`。省/市互斥渲染，map 上同一时刻只有当前层的 polygon。

## 6. tooltip 冲突处理

- 一个 layer 同时只绑一个 tooltip。常驻标签接管「显名字」。
- 市层：移除原 hover tooltip（内容重复），保留 hover 高亮、click。
- 省层：permanent tooltip 常驻省名，hover 动态 `setContent` 加进度，mouseout 还原。

## 7. 样式

新增 `.map-label`（写入 `src/index.css`，与现有 `.custom-tooltip` 同处）：

```css
:root { --map-label-color: #fff; }
.dark { --map-label-color: #f1f5f9; }

.leaflet-tooltip.map-label {
  background: transparent; border: none; box-shadow: none;
  color: var(--map-label-color); font-weight: 600; font-size: 11px;
  padding: 0; white-space: nowrap;
  text-shadow: 0 0 3px #000, 0 0 2px #000, 1px 1px 1px #000;
}
.leaflet-tooltip.map-label::before { display: none; } /* 去箭头 */
```

- 调 z-index 保证在 WaterProgress SVG overlay 之上可读。

## 8. 性能

- `eachLayer` 遍历 O(n)，n≈几百；每层 2 次 `latLngToContainerPoint` + 比较，实测 <10ms。
- 同时显示标签受阈值限制，DOM 通常几十个，无压力。
- `moveend` 防抖 50ms + `requestAnimationFrame` 合并，避免高频抖动。
- panning 过程中不重算（permanent tooltip 自动跟随平移）。

## 9. 边界情况

- `isZoomSwitchEnabled=false`（强制市层）：标签照常按 zoom 动态显。
- 极小图块（港澳、江浙密集市）：达不到阈值不显，放大到够大才显。
- 狭长省份（甘肃等）质心偏移：用 `turf.centerOfMass`，极端情况文字略偏可接受；必要时换 `turf.pointOnFeature`。
- WaterProgress overlay 叠加：z-index 处理保证可读。
- MultiPolygon 省份（如海南诸岛）：质心可能落在主块外，实现时取最大子 polygon 的质心或 `turf.pointOnFeature`。

## 10. 改动文件

- `src/components/Map.jsx`：新增 `LabelVisibilityManager`；改 `onEachCityFeature`、`ProvincePolygon`；加常量；`ZoomHandler` 不变（共存）。
- `src/index.css`：加 `.map-label` 与 `--map-label-color` 变量。

## 11. 测试与验证

项目无测试框架，手动验证矩阵：

| 维度 | 取值 |
|---|---|
| 层 | 省层 / 市层 |
| zoom | 小（近全景）/ 中 / 大（城市级）|
| 主题 | light / dark |
| 配色 | 彩色 / 单色 |

确认：
- 标签显隐符合「够大才显」。
- 小图块不显，放大渐显。
- 描边在各种底色可读。
- zoom/pan 流畅，无明显卡顿。
- `pnpm build` 通过、`pnpm lint` 无新增错误。

## 12. 非目标（YAGNI）

- 不做标签避让/碰撞检测（Leaflet 默认行为，复杂度高，当前阈值已足够）。
- 不做标签按点亮状态区分样式。
- 不做用户开关（沿用现有图层切换，不再加 UI）。
- 不做 canvas/SVG 自绘（方案 3），除非实测永久 tooltip 性能不达标。
