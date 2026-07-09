# 地图省市名字常驻标签 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 地图块在屏幕上足够大时，在省/市 polygon 上常驻显示省名/市名；太小放不下则不显示。

**Architecture:** 复用现有两层结构（省/市）。新增 `LabelVisibilityManager` 子组件，监听 `zoomend`/`moveend`，遍历当前层 polygon，按屏幕投影大小 toggle 其 permanent tooltip。省/市 polygon 在 `direction:'center'` 绑 permanent tooltip。标签用 CSS `text-shadow` 描边保证可读。

**Tech Stack:** React 19、react-leaflet v5、Leaflet 1.9、Vite 7。

## Global Constraints

- 项目**无测试框架**：每个任务用 `pnpm build`（须通过）+ `pnpm lint`（无**新增**报错）+ 手动验证矩阵代替自动化测试（spec 第 11 节）。
- UI 文案为中文。
- 不改外层架构：两层结构、`ZoomHandler` 切层逻辑保持不变。
- react-leaflet v5：`<Polygon>` 用 `ref` 拿 Leaflet layer 实例。

## 与 spec 的实现差异

1. **质心定位**：用 Leaflet `direction:'center'`（polygon `getBounds()` 中心）代替 spec 的 `turf.centerOfMass`。更简单，对绝大多数省市足够；个别狭长省份（甘肃等）文字偏移明显时再换 `turf.centerOfMass` + marker。
2. **测试**：spec 第 11 节已定手动验证矩阵，本计划不引入测试框架。

## 文件结构

- `src/index.css`（改）：加 `--map-label-color` 变量（浅/深各一套）+ `.leaflet-tooltip.map-label` 样式。
- `src/components/Map.jsx`（改）：加常量与 `shouldShowLabel` 纯函数、新增 `LabelVisibilityManager` 组件、改 `onEachCityFeature`、改 `ProvincePolygon`、在 `MapContainer` 内挂载 `LabelVisibilityManager`。

---

### Task 1: 标签 CSS 样式

**Files:**
- Modify: `src/index.css`（`:root` 块、`html.dark` 块、文件末尾）

**Interfaces:**
- Produces: `.leaflet-tooltip.map-label` 类 + `--map-label-color` 变量，供 Task 4/5 的 tooltip `className` 引用。

- [ ] **Step 1: 在 `:root` 块加浅色模式标签颜色变量**

在 `src/index.css` 的 `:root` 块内，`--map-line-color-rgb` 那行（第 26 行）之后、`}` 之前加：

```css
  /* 常驻地名标签文字色（描边保证在任意底色可读） */
  --map-label-color: #ffffff;
```

- [ ] **Step 2: 在 `html.dark` 块加深色模式标签颜色变量**

在 `html.dark` 块内，`--map-line-color-rgb` 那行（第 47 行）之后、`}` 之前加：

```css
  --map-label-color: #f1f5f9;
```

- [ ] **Step 3: 文件末尾加 `.map-label` 样式**

在 `src/index.css` 文件末尾追加：

```css
/* --- 地图常驻地名标签 --- */
.leaflet-tooltip.map-label {
  background: transparent;
  border: none;
  box-shadow: none;
  color: var(--map-label-color);
  font-weight: 600;
  font-size: 11px;
  padding: 0;
  white-space: nowrap;
  text-shadow: 0 0 3px #000, 0 0 2px #000, 1px 1px 1px #000;
  z-index: 700;
}
.leaflet-tooltip.map-label::before {
  display: none; /* 去掉 tooltip 默认小箭头 */
}
```

- [ ] **Step 4: 构建验证**

Run: `pnpm build`
Expected: 构建成功，无 CSS/语法错误。

- [ ] **Step 5: 提交**

```bash
git add src/index.css
git commit -m "添加地图常驻地名标签的 CSS 样式"
```

---

### Task 2: 显隐阈值常量与 `shouldShowLabel` 纯函数

**Files:**
- Modify: `src/components/Map.jsx`（顶部，`getColorfulColor` 函数之后、`ZoomHandler` 之前）

**Interfaces:**
- Produces: 常量 `CITY_LABEL_MIN_PX`、`PROVINCE_LABEL_MIN_PX`、`MIN_LABEL_AREA`；函数 `shouldShowLabel(widthPx, heightPx, minPx): boolean`。Task 3 的 `LabelVisibilityManager` 消费这些。

- [ ] **Step 1: 加常量与纯函数**

在 `src/components/Map.jsx` 的 `getColorfulColor` 函数（第 13–21 行）之后、`// --- 缩放处理组件 ---` 注释（第 23 行）之前插入：

```js
// ==============================
// --- 地名标签显隐阈值 ---
const CITY_LABEL_MIN_PX = 45;
const PROVINCE_LABEL_MIN_PX = 35;
const MIN_LABEL_AREA = 1600;

// 判断某 polygon 的屏幕投影是否够大、能放下名字标签
function shouldShowLabel(widthPx, heightPx, minPx) {
  return Math.min(widthPx, heightPx) >= minPx && widthPx * heightPx >= MIN_LABEL_AREA;
}
```

- [ ] **Step 2: 构建验证**

Run: `pnpm build`
Expected: 构建成功。

Run: `pnpm lint`
Expected: 无**新增**报错（项目预存的 unused-vars 等报错忽略）。

- [ ] **Step 3: 提交**

```bash
git add src/components/Map.jsx
git commit -m "添加地名标签显隐阈值常量与 shouldShowLabel 判断函数"
```

---

### Task 3: `LabelVisibilityManager` 组件

**Files:**
- Modify: `src/components/Map.jsx`（`ZoomHandler` 之后新增组件；`MapContainer` 内挂载）

**Interfaces:**
- Consumes: `shouldShowLabel`、`CITY_LABEL_MIN_PX`、`PROVINCE_LABEL_MIN_PX`（来自 Task 2）。
- Produces: 组件 `LabelVisibilityManager({ activeLayer })`。它遍历 `map.eachLayer`，对带 `feature` 且绑了 permanent tooltip 的 polygon layer，按屏幕大小 `openTooltip()` / `closeTooltip()`。Task 4/5 绑的 tooltip 由它控制显隐。

- [ ] **Step 1: 新增 `LabelVisibilityManager` 组件**

在 `src/components/Map.jsx` 的 `ZoomHandler` 函数（第 25–51 行）之后、`// --- 省份多边形组件 ---` 注释（第 53 行）之前插入：

```jsx
// ==============================
// --- 地名标签显隐管理 (按 polygon 屏幕投影大小动态 toggle permanent tooltip) ---
function LabelVisibilityManager({ activeLayer }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const minPx = activeLayer === 'city' ? CITY_LABEL_MIN_PX : PROVINCE_LABEL_MIN_PX;

    const evaluate = () => {
      map.eachLayer(layer => {
        if (!layer.feature || typeof layer.getTooltip !== 'function') return;
        const tooltip = layer.getTooltip();
        if (!tooltip) return;
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

    return () => {
      cancelAnimationFrame(raf);
      map.off('zoomend', evaluate);
      map.off('moveend', onMoveEnd);
      if (moveTimer) clearTimeout(moveTimer);
    };
  }, [map, activeLayer]);
  return null;
}
```

- [ ] **Step 2: 在 `MapContainer` 内挂载**

在 `src/components/Map.jsx` 的 `return` 中，`<ZoomHandler ... />`（第 190 行）之后加一行：

```jsx
      <LabelVisibilityManager activeLayer={activeLayer} />
```

- [ ] **Step 3: 构建验证**

Run: `pnpm build`
Expected: 构建成功。

Run: `pnpm lint`
Expected: 无新增报错。

- [ ] **Step 4: 提交**

```bash
git add src/components/Map.jsx
git commit -m "新增 LabelVisibilityManager 按图块大小动态显隐地名标签"
```

> 说明：此时地图上还没有 polygon 绑 permanent tooltip，`evaluate` 内 `layer.getTooltip()` 返回 null、整体 no-op，属正常。Task 4/5 绑 tooltip 后立即生效。

---

### Task 4: 市层 permanent tooltip

**Files:**
- Modify: `src/components/Map.jsx` 的 `onEachCityFeature`（第 150–184 行）

**Interfaces:**
- Consumes: `.map-label` 类（Task 1）；`LabelVisibilityManager`（Task 3）会 toggle 这些 tooltip。
- Produces: 每个市 polygon 在边界中心绑 `permanent` tooltip 显市名。

- [ ] **Step 1: 替换 `onEachCityFeature` 整个函数体**

把 `src/components/Map.jsx` 第 150–184 行的 `onEachCityFeature` 整体替换为：

```jsx
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
```

变化要点：
- `bindTooltip` 由 `{permanent:false, follow:true, sticky:true}` 改为 `{permanent:true, className:'map-label', direction:'center'}`。
- 新增 `layer.closeTooltip()` 初始隐藏。
- `click` 内移除原来的 `e.target.closeTooltip()`（permanent tooltip 的显隐交给 `LabelVisibilityManager`）。

- [ ] **Step 2: 构建验证**

Run: `pnpm build`
Expected: 构建成功。

- [ ] **Step 3: 手动验证（市层标签）**

Run: `pnpm dev`，浏览器打开应用，登录后操作：
1. 放大到市层（`zoom ≥ 5`）。
2. 预期：**大块**的市 polygon 上常驻显示市名；**小块**（如江浙密集区、港澳）不显示。
3. 继续放大：之前不显示的小市逐渐出现名字。
4. 缩小到省层（`zoom < 5`）：市名全部消失（市层卸载）。
5. 鼠标悬停未点亮城市：仍有半透明高亮（hover 高亮保留）。

Expected: 以上全部符合。

- [ ] **Step 4: 提交**

```bash
git add src/components/Map.jsx
git commit -m "市层 polygon 改用常驻标签显示市名，由图块大小动态控制"
```

---

### Task 5: 省层 permanent tooltip + hover 进度

**Files:**
- Modify: `src/components/Map.jsx` 的 `ProvincePolygon`（第 55–121 行）

**Interfaces:**
- Consumes: `.map-label` 类（Task 1）；`LabelVisibilityManager`（Task 3）控制显隐。
- Produces: 每个省 polygon 在边界中心绑 permanent tooltip 显省名；mouseover 时 tooltip 内容追加 `(已访/总数)`，mouseout 还原。

- [ ] **Step 1: 在 `ProvincePolygon` 顶部加 `bindProvinceLabel` 工具函数**

把 `src/components/Map.jsx` 第 55–73 行（`ProvincePolygon` 开头到 `tooltipText` 计算结束）替换为：

```jsx
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

  // 在省 polygon 上绑常驻省名标签；hover 时切到「省名 + 进度」，移出还原
  const bindProvinceLabel = (layer) => {
    if (!layer || layer._labelBound) return;
    layer._labelBound = true;
    layer.bindTooltip(provinceName, { className: 'map-label', permanent: true, direction: 'center' });
    layer.closeTooltip();
    layer.on('mouseover', () => {
      const t = layer.getTooltip();
      if (t) t.setContent(tooltipText);
    });
    layer.on('mouseout', () => {
      const t = layer.getTooltip();
      if (t) t.setContent(provinceName);
    });
  };
```

- [ ] **Step 2: 改 `single` 模式 `progress <= 0` 分支（原第 75–81 行）**

把该分支的 `<Polygon ... />` 替换为（去掉 mouseover/mouseout 的 bindTooltip/closeTooltip，加 `ref={bindProvinceLabel}`）：

```jsx
  if (colorMode === 'single') {
    const provinceOwnProgress = progressData?.progress ?? 0;
    if (provinceOwnProgress <= 0) {
      return (
        <Polygon positions={fullPositions} pathOptions={{ color: `rgb(${lineRgb})`, weight: 0.5, fillColor: 'transparent' }} ref={bindProvinceLabel} eventHandlers={{ click: () => onProvinceClick(feature) }} />
      );
    }
```

- [ ] **Step 3: 改 `single` 模式 `progress > 0` 分支（原第 82–90 行）**

把 `minColor`/`maxColor` 等插值计算保留，把该分支的 `<Polygon ... />` 替换为：

```jsx
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
```

- [ ] **Step 4: 改 `colorful` 模式分支（原第 93–119 行），给 full polygon 加 `ref`、去掉其 mouseover/mouseout**

`waterPositions` 计算逻辑保留；return 部分替换为（注意：water polygon 不加 ref，只给后面的 full polygon 加 `ref={bindProvinceLabel}` 并简化 eventHandlers 为只保留 click）：

```jsx
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
```

- [ ] **Step 5: 构建验证**

Run: `pnpm build`
Expected: 构建成功。

Run: `pnpm lint`
Expected: 无新增报错。

- [ ] **Step 6: 手动验证（省层标签 + hover 进度）**

Run: `pnpm dev`，缩到省层（`zoom < 5`，确认右上角图层切换开启）：
1. 预期：**大块**省份常驻显示省名；小块（如港澳）不显示。
2. 鼠标悬停某省：标签内容变为「省名 (已访/总数)」；移出还原为「省名」。
3. 缩放/平移：标签随图块大小动态出现/消失。
4. 切换 light/dark 主题、彩色/单色模式：标签始终可读（描边清晰）。

Expected: 以上全部符合。

- [ ] **Step 7: 提交**

```bash
git add src/components/Map.jsx
git commit -m "省层 polygon 改用常驻标签显示省名，hover 时显示访问进度"
```

---

### Task 6: 全量验证矩阵 + 阈值微调

**Files:**
- Modify（仅按需）: `src/components/Map.jsx` 的 `CITY_LABEL_MIN_PX` / `PROVINCE_LABEL_MIN_PX` / `MIN_LABEL_AREA`。

**Interfaces:** 无新接口。

- [ ] **Step 1: 跑验证矩阵**

Run: `pnpm dev`，按下表组合逐一核对：

| 层 | zoom | 主题 | 配色 | 预期 |
|---|---|---|---|---|
| 省层 | 小（近全景） | light | 彩色 | 大省显名、小省不显，可读 |
| 省层 | 中 | dark | 单色 | 同上，hover 显进度 |
| 市层 | 中 | light | 彩色 | 大市显名、小市不显 |
| 市层 | 大（城市级） | dark | 单色 | 小市放大后渐显 |
| 市层 | 任意 | 任意 | 任意 | `isZoomSwitchEnabled=关` 时市层照常动态显标签 |

同时确认：
- zoom / pan 流畅，无明显卡顿。
- WaterProgress 水位线动画正常，标签不被遮挡（`z-index:700` 生效）。

- [ ] **Step 2: 阈值微调（如需）**

若发现：
- 标签出现太早（挤）→ 调高 `CITY_LABEL_MIN_PX`（如 50）或 `MIN_LABEL_AREA`（如 2000）。
- 标签出现太晚（大图块也没名）→ 调低相应阈值。
- 某狭长省份文字明显偏出 → 在 `ProvincePolygon` 的 `bindProvinceLabel` 内把 `direction: 'center'` 改为用 `turf.centerOfMass(feature)` 计算质心并 `layer.openTooltip([lat, lng])` 定位（该省单独处理或全局替换）。

如改了阈值，进入 Step 3；未改则跳到 Step 4。

- [ ] **Step 3: 提交阈值调整（仅当 Step 2 有改动）**

```bash
git add src/components/Map.jsx
git commit -m "微调地名标签显隐阈值"
```

- [ ] **Step 4: 最终构建确认**

Run: `pnpm build`
Expected: 构建成功。

Run: `pnpm lint`
Expected: 无新增报错。

- [ ] **Step 5: 部署**

push 到 `main`，GitHub Actions 自动 build + rsync 到服务器；硬刷新浏览器验证线上效果。

---

## Self-Review 记录

- **Spec 覆盖**：spec 第 2 节需求 1（省/市层显名）→ Task 4/5；需求 2（动态显隐）→ Task 2/3；需求 3（描边可读）→ Task 1；需求 4（所有省/市参与）→ Task 3 遍历不区分点亮；需求 5（hover 进度）→ Task 5。✓
- **Placeholder**：无 TBD/TODO，每个代码步骤含完整代码。✓
- **类型/命名一致**：`shouldShowLabel`、`CITY_LABEL_MIN_PX`、`LabelVisibilityManager`、`bindProvinceLabel`、`map-label` 类名前后一致。✓
- **与 spec 差异**：质心用 `direction:'center'` 代替 `turf.centerOfMass`（已在开头声明）；无测试框架用手动验证（已声明）。
