# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

"迹忆中国" (China Cities Marked) — an interactive map application for tracking visited Chinese cities. Users authenticate, mark prefecture-level cities on a Leaflet map, attach photos/comments, and view visit statistics.

**Live site:** https://zxytd.top/

## Commands

```bash
pnpm dev          # Start dev server (Vite)
pnpm build        # Production build
pnpm lint         # ESLint check
pnpm preview      # Preview production build
node generate-map.cjs  # Regenerate province-city mapping from GeoJSON sources
```

## Tech Stack

- **React 19** + **Vite 7** (JSX, no TypeScript)
- **Leaflet / react-leaflet** for interactive map rendering
- **TopoJSON** (topojson-client) for compact geographic data; converted to GeoJSON at runtime
- **Supabase** for auth (username-based) and data persistence
- **Cloudinary** for photo uploads
- **@turf/turf** for geospatial calculations (centroids, point-in-polygon)
- **d3-scale / d3-scale-chromatic** for province color mapping
- Package manager: **pnpm**

## Architecture

### Data Flow

1. User logs in via `Auth.jsx` → Supabase auth
2. `App.jsx` loads three data files from `/public/` in parallel: `中国_市.json` (TopoJSON cities), `中国_省.json` (TopoJSON provinces), `province-city-map.json` (pre-computed province→city mapping)
3. TopoJSON is converted to GeoJSON via `topojson.feature()` on load
4. `visited_cities` table fetched from Supabase, stored as a `Map<cityName, cityData>`
5. Province progress is computed in `useMemo` — each province's fill-progress is derived from how many of its cities the user has visited

### Component Hierarchy

```
App.jsx (state hub — owns all data, passes via props)
├── Auth.jsx              # Login/register (Supabase username auth)
├── Map.jsx               # Leaflet map with dual-layer rendering:
│   # Province layer (zoomed out) / City layer (zoomed in)
│   # ZoomHandler switches layers at threshold
│   # WaterProgress SVG overlay shows visit progress
├── Search.jsx            # City search with autocomplete
├── Stats.jsx             # Visit count display
├── Sidebar.jsx           # City detail panel (mark/unmark, photos, dates)
├── ThemeToggle.jsx       # Dark/light + colorful/monochrome toggle
├── ImageModal.jsx        # Photo lightbox
├── CommentModal.jsx      # City comment/rating editor
├── NotificationModal.jsx # Update announcements
└── StarRating.jsx        # Reusable star rating component
```

### Map Rendering Strategy

`Map.jsx` uses a **dual-layer zoom system**: province polygons render at low zoom, city polygons at high zoom. A `ZoomHandler` component listens for `zoomend` events and switches `activeLayer` state. The `WaterProgress` SVG overlay animates a "water fill" effect based on overall visit progress, clipped to China's boundary.

### Geographic Data Pipeline

- Source files in `public/`: TopoJSON for compact size
- `generate-map.cjs` — Node script that computes province→city mappings using turf point-in-polygon; outputs `province-city-map.json`
- Province colors generated per-name using d3's `interpolateSinebow` scale (hash-based normalization)

### Supabase Schema

- **`users`** table: user accounts
- **`visited_cities`** table: `user_id`, `city_name`, `visit_date`, `comment`, `rating`; unique constraint on `(user_id, city_name)` with upsert
- **`photos`** table: `visited_city_id` (FK), `category`, `photo_url`; categories: scenery, friends, food, lover

## Key Conventions

- All UI text is in Chinese (中文)
- Environment variables prefixed with `VITE_` (Supabase URL/key in `.env`)
- CSS is component-scoped (`ComponentName.css` alongside each `.jsx`), plus global `App.css` and `index.css` for CSS custom properties and theme variables
- No router — single-page app with state-driven views (auth gate at `App.jsx` level)
- `.env` is checked in (contains only Supabase anon key, not secret)
