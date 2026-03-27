# Nano Banana CLI Reference

> Complete option reference for all commands. SKILL.md provides the workflow overview;
> read this file when you need exact parameter details.

## generate

```bash
./nanobanana generate "<prompt>" [options]
```

| Option          | Description                                           |
|-----------------|-------------------------------------------------------|
| `--template`    | Template name (auto-sets ratio/size/prompt)            |
| `--model`       | Model override (default: `nano-banana-2`)             |
| `--ratio`       | Aspect ratio override                                  |
| `--size`        | Resolution override (`1K`/`2K`/`4K`, case-insensitive)|
| `--format`      | Output format (`png`/`jpeg`/`webp`)                   |
| `--ref-image`   | Reference image file (repeatable, max 8)              |
| `--raw`         | Use prompt as-is, skip template enhancement            |
| `-o`/`--output` | Output directory                                       |
| `-n`/`--name`   | Output filename (without extension)                    |

### All Templates

#### E-Commerce (6)

| Template    | Ratio | Size | Use Case                               |
|-------------|-------|------|----------------------------------------|
| `hero`      | 1:1   | 2K   | Product hero shot on white background  |
| `banner`    | 16:9  | 2K   | Promotional marketing banner           |
| `detail`    | 3:4   | 2K   | Close-up material/texture shot         |
| `lifestyle` | 4:3   | 2K   | Product in aspirational scene          |
| `grid`      | 1:1   | 2K   | Four-panel detail page showcase        |
| `social`    | 4:5   | 1K   | Social media / Instagram post          |

#### Design (6)

| Template       | Ratio | Size | Use Case                               |
|----------------|-------|------|----------------------------------------|
| `app-screen`   | 9:16  | 2K   | Mobile app UI screenshot               |
| `landing`      | 16:9  | 2K   | Website landing page hero section      |
| `thumbnail`    | 16:9  | 1K   | YouTube/video thumbnail                |
| `story`        | 9:16  | 2K   | Instagram/TikTok story graphic         |
| `card`         | 4:3   | 1K   | UI card component design               |
| `presentation` | 16:9  | 2K   | Presentation slide design              |

#### Mobile (5)

| Template        | Ratio | Size | Use Case                              |
|-----------------|-------|------|---------------------------------------|
| `app-splash`    | 9:16  | 2K   | App splash / launch screen            |
| `app-store`     | 9:16  | 2K   | App Store / Play Store screenshot     |
| `mobile-banner` | 21:9  | 1K   | Mobile in-app banner ad               |
| `og-image`      | 16:9  | 1K   | Social sharing Open Graph preview     |
| `notification`  | 1:1   | 1K   | Push notification rich media          |

#### Icon (8)

| Template       | Grid  | Ratio | Size | Use Case                              |
|----------------|-------|-------|------|---------------------------------------|
| `icon`         | 1x1   | 1:1   | 1K   | Single icon, centered, 80% fill       |
| `icon-set`     | 3x3   | 1:1   | 2K   | 9 related icons in uniform grid       |
| `icon-set-6`   | 3x2   | 3:2   | 2K   | 6 related icons in landscape grid     |
| `icon-set-4`   | 2x2   | 1:1   | 2K   | 4 related icons in grid               |
| `icon-set-8`   | 4x2   | 16:9  | 2K   | 8 related icons in wide grid          |
| `icon-set-12`  | 4x3   | 4:3   | 2K   | 12 related icons in grid              |
| `icon-variants`| 2x2   | 1:1   | 2K   | Same icon in 4 visual styles          |
| `app-icon`     | 1x1   | 1:1   | 2K   | Single app icon, iOS/Android ready    |

## refine

```bash
./nanobanana refine <input-image> [prompt] [options]
```

| Option          | Description                                           |
|-----------------|-------------------------------------------------------|
| `--template`    | Refinement template                                   |
| `--model`       | Model override                                        |
| `--ratio`       | Aspect ratio (`auto` = preserve original)             |
| `--size`        | Resolution (default: `2K`)                            |
| `--format`      | Output format                                         |
| `--extra-ref`   | Additional reference image (max 7)                    |
| `--raw`         | Use prompt as-is                                      |
| `-o`/`--output` | Output directory                                      |
| `-n`/`--name`   | Output filename                                       |

### Refinement Templates

| Template         | Needs Prompt | Use Case                              |
|------------------|-------------|---------------------------------------|
| `bg-replace`     | yes         | Replace background with specified scene |
| `bg-white`       | no          | White e-commerce background            |
| `bg-remove`      | no          | Chromakey green for compositing        |
| `enhance`        | no          | Quality boost (sharp, color, noise)    |
| `retouch`        | no          | Natural portrait retouching            |
| `object-swap`    | yes         | Replace specific object in scene       |
| `style-transfer` | yes         | Apply artistic style                   |
| `color-grade`    | yes         | Professional color grading             |
| `extend`         | yes         | Extend/outpaint canvas                 |

## icon-extract

```bash
./nanobanana icon-extract <input-image> [options]
```

| Option              | Default                 | Description                                    |
|---------------------|-------------------------|------------------------------------------------|
| `-o` / `--output`   | `.`                     | Output directory                               |
| `--prefix`          | `icon`                  | Filename prefix                                |
| `-l` / `--layout`   | `auto`                  | Detection: `auto` or `grid-CxR`               |
| `--model`           | `birefnet-general-lite` | rembg model for bg removal                     |
| `--skip-bg-removal` | off                     | Skip bg removal (already transparent)          |
| `--padding`         | `0.10`                  | Padding ratio around each icon                 |
| `--min-size`        | `24`                    | Minimum bounding box side (px)                 |
| `--merge-distance`  | `0.05`                  | Merge threshold (ratio of diagonal, auto only) |
| `--output-size`     | `512`                   | Export size (square px). `0` = original        |
| `--no-square`       | off                     | Keep original aspect ratio                     |
| `--keep-intermediate`| off                    | Save bg-removed intermediate                   |
| `--app-icon-sizes`  | off                     | Export to platform sizes (ios/android/web/all)  |

### App Icon Standard Sizes

When `--app-icon-sizes` is used, each icon is exported to:

- **iOS** (11 sizes): 1024, 180, 167, 152, 120, 87, 80, 60, 58, 40px
- **Android** (6 sizes): 512, 192, 144, 96, 72, 48px
- **Web** (5 sizes): 512, 192, 180, 32, 16px

## auth

```bash
./nanobanana auth init --api-key <KEY>         # Store + verify
./nanobanana auth init --api-key <KEY> --no-verify  # Store only
./nanobanana auth status                       # Check auth
./nanobanana auth clean                        # Remove credentials
```

## Available Models

| Model ID                           | Alias           | Max Res | Best For              |
|------------------------------------|-----------------|---------|-----------------------|
| `gemini-2.5-flash-image`           | nano-banana     | 1024px  | Speed + efficiency    |
| `gemini-3.1-flash-image-preview`   | nano-banana-2   | 2K      | **Default.** Balance  |
| `gemini-3-pro-image-preview`       | nano-banana-pro | 4K      | Studio quality        |

Aliases: `flash` = nano-banana-2, `pro` = nano-banana-pro, `fast` = nano-banana.

## Aspect Ratios

`1:1`, `16:9`, `9:16`, `3:4`, `4:3`, `3:2`, `2:3`, `5:4`, `4:5`, `21:9`
