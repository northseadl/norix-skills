---
name: image-studio
metadata:
  version: 0.1.5
description: >
  AI image generation and editing: e-commerce templates (hero/banner/detail/lifestyle),
  image refinement (background replace/remove, enhance, retouch, style transfer),
  icon extraction (bg-removal + detect + smart crop with transparent output).
  Use when generating product images, design mockups, mobile assets, app icons,
  or editing/refining existing images.
---

# Image Studio — AI Image Generation & Editing

> CLI: `./nanobanana <module> [options]`
> Full parameter reference: `references/cli_reference.md`
> API internals: `references/api_reference.md`

## Auth (First-Use)

Credential resolution order: env var → NX1 vault → legacy JSON.

**Path 1 — Env var** (zero setup): set `NANOBANANA_API_KEY`, `GEMINI_API_KEY`, or `GOOGLE_API_KEY`.

**Path 2 — Persistent init**: `./nanobanana auth init --api-key "<key>"` (verifies + encrypts to vault).

Get key at [Google AI Studio](https://aistudio.google.com/apikey) (starts with `AIza`).

## Models

| Alias (use this)  | Max Res | Notes                                  |
|-------------------|---------|----------------------------------------|
| `nano-banana-2`   | 2K      | **Default.** Best speed/quality balance|
| `nano-banana-pro` | 4K      | Studio quality, advanced reasoning     |
| `nano-banana`     | 1024px  | Fastest, basic quality                 |

> **Rule**: Always use default model. Only switch to `pro`/`4K` when the user **explicitly** requests it.

## Workflow 1: Generate

```bash
./nanobanana generate "<description>" --template <tpl> [--model X] [--ratio X] [--size X]
```

### Template Quick Reference

**E-Commerce** — product photography with professional directives:

| Template    | Ratio | Best For                      |
|-------------|-------|-------------------------------|
| `hero`      | 1:1   | White-bg product hero shot    |
| `banner`    | 16:9  | Promotional marketing banner  |
| `detail`    | 3:4   | Close-up texture/material     |
| `lifestyle` | 4:3   | Aspirational scene placement  |
| `grid`      | 1:1   | Four-panel detail showcase    |
| `social`    | 4:5   | Instagram-ready post          |

**Design** — UI/UX and creative assets:

| Template       | Ratio | Best For                       |
|----------------|-------|--------------------------------|
| `app-screen`   | 9:16  | Mobile app UI mockup           |
| `landing`      | 16:9  | Website landing page hero      |
| `thumbnail`    | 16:9  | Video thumbnail / cover        |
| `story`        | 9:16  | Instagram/TikTok story         |
| `card`         | 4:3   | UI card component              |
| `presentation` | 16:9  | Slide design                   |

**Mobile** — platform-specific mobile assets:

| Template        | Ratio | Best For                       |
|-----------------|-------|--------------------------------|
| `app-splash`    | 9:16  | App launch screen              |
| `app-store`     | 9:16  | App Store/Play Store screenshot|
| `mobile-banner` | 21:9  | In-app banner ad               |
| `og-image`      | 16:9  | Social sharing link preview    |
| `notification`  | 1:1   | Push notification image        |

**Icon** — extraction-optimized sprite sheets (use with `icon-extract` pipeline):

| Template       | Grid | Best For                         |
|----------------|------|----------------------------------|
| `icon`         | 1x1  | Single icon, 80% canvas fill     |
| `app-icon`     | 1x1  | App icon (iOS/Android ready)     |
| `icon-set`     | 3x3  | 9 related icons                  |
| `icon-set-4`   | 2x2  | 4 related icons                  |
| `icon-set-6`   | 3x2  | 6 related icons                  |
| `icon-set-8`   | 4x2  | 8 related icons                  |
| `icon-set-12`  | 4x3  | 12 related icons                 |
| `icon-variants`| 2x2  | Same icon in 4 styles            |

### Key Examples

```bash
./nanobanana generate "luxury leather handbag" --template hero
./nanobanana generate "fitness tracker dashboard" --template app-screen
./nanobanana generate "SaaS landing page" --template landing
./nanobanana generate "my podcast app" --template app-icon
./nanobanana generate "nav: home, search, cart, profile, settings, notifications, messages, help, menu" --template icon-set
./nanobanana generate "cloud computing" --template icon-variants
./nanobanana generate "same style in blue" --ref-image product_red.jpg
```

## Workflow 2: Refine

```bash
./nanobanana refine <image> [prompt] --template <tpl>
```

| Template         | Prompt? | What it does                     |
|------------------|---------|----------------------------------|
| `bg-white`       | no      | White e-commerce background      |
| `bg-remove`      | no      | Chromakey green for compositing  |
| `bg-replace`     | yes     | Replace background with X        |
| `enhance`        | no      | Sharpen, denoise, color correct  |
| `retouch`        | no      | Natural portrait retouching      |
| `object-swap`    | yes     | Replace specific object          |
| `style-transfer` | yes     | Apply artistic style             |
| `color-grade`    | yes     | Professional color grading       |
| `extend`         | yes     | Outpaint / extend canvas         |

```bash
./nanobanana refine product.jpg --template bg-white
./nanobanana refine photo.jpg "watercolor painting" --template style-transfer
./nanobanana refine photo.jpg "make lighting warmer, golden hour glow"  # free-form
```

## Workflow 3: Icon Extraction

Pipeline: **bg-removal → detection → smart crop → individual RGBA PNGs + manifest**.

```bash
./nanobanana icon-extract <image> [--layout grid-CxR] [-o ./icons/]
```

### Detection Strategy

| Strategy | Syntax             | When to use                           |
|----------|--------------------|---------------------------------------|
| **grid** | `--layout grid-3x3`| Template-generated sprites (reliable) |
| **auto** | `--layout auto`    | Unknown layout (default)              |

Grid mode is deterministic — divides into NxM cells, refines each by alpha scanning, discards empty cells.
Always prefer grid mode when the template grid is known.

### Generate → Extract Chaining

`generate` prints a layout hint (e.g., `Layout: 3x3 grid`). Chain to `icon-extract` with matching grid:

```bash
./nanobanana generate "social: like, comment, share, save, follow, message, search, notify, profile" --template icon-set
./nanobanana icon-extract <output>.png --layout grid-3x3 -o ./icons/
```

### App Icon Multi-Size Export

Export to all iOS + Android + Web standard sizes (22 total):

```bash
./nanobanana icon-extract app_icon.png --app-icon-sizes all -o ./icons/
./nanobanana icon-extract app_icon.png --app-icon-sizes ios  # iOS only
```

## Agent Decision Guide

| User says | Agent does |
|-----------|-----------|
| "生成商品主图/产品图" | `generate --template hero` |
| "促销 Banner/横幅" | `generate --template banner` |
| "App 界面/UI截图" | `generate --template app-screen` |
| "落地页/着陆页" | `generate --template landing` |
| "视频封面/缩略图" | `generate --template thumbnail` |
| "App 启动页/闪屏" | `generate --template app-splash` |
| "生成N个图标" | `generate --template icon-set-N` → `icon-extract --layout grid-CxR` |
| "生成App图标" | `generate --template app-icon` (optionally `--app-icon-sizes all`) |
| "图标风格对比" | `generate --template icon-variants` → `icon-extract --layout grid-2x2` |
| "换白色背景" | `refine <img> --template bg-white` |
| "去背景/抠图" | `refine <img> --template bg-remove` |
| "风格迁移" | `refine <img> "<style>" --template style-transfer` |
| "图片增强/精修" | `refine <img> --template enhance` |
| "高清4K" | add `--size 4K --model nano-banana-pro` |

## Error Recovery

| Error | Action |
|-------|--------|
| No API key | Trigger Auth flow above |
| 401/403 | `auth status` → guide to aistudio.google.com/apikey |
| 429 Rate limit | Auto-retried 3x with exponential backoff |
| IMAGE_SAFETY | Rephrase prompt |
| File > 20MB | Suggest resize before upload |
