"""
Nano Banana API Client — Core HTTP engine for Gemini native image generation.

Uses Google Generative Language API directly:
  POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent

Authentication via x-goog-api-key header (Google AI Studio API key).
Zero external dependencies beyond Python stdlib.
"""

import base64
import json
import mimetypes
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Optional

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
DEFAULT_MODEL = "gemini-3.1-flash-image-preview"  # Nano Banana 2

MODELS = {
    "gemini-2.5-flash-image": {
        "alias": "Nano Banana",
        "description": "Speed + efficiency, 1024px output",
        "max_res": None,  # No imageSize param, fixed 1024px
        "supports_image_size": False,
    },
    "gemini-3.1-flash-image-preview": {
        "alias": "Nano Banana 2",
        "description": "Best balance of speed, quality, and intelligence",
        "max_res": "2K",
        "supports_image_size": True,
    },
    "gemini-3-pro-image-preview": {
        "alias": "Nano Banana Pro",
        "description": "Studio quality, 4K, advanced reasoning (Thinking)",
        "max_res": "4K",
        "supports_image_size": True,
    },
}

# Friendly aliases for user convenience
MODEL_ALIASES = {
    "nano-banana": "gemini-2.5-flash-image",
    "nano-banana-2": "gemini-3.1-flash-image-preview",
    "nano-banana-pro": "gemini-3-pro-image-preview",
    "flash": "gemini-3.1-flash-image-preview",
    "pro": "gemini-3-pro-image-preview",
    "fast": "gemini-2.5-flash-image",
}

VALID_ASPECT_RATIOS = [
    "1:1", "16:9", "9:16", "3:4", "4:3",
    "3:2", "2:3", "5:4", "4:5", "21:9",
]

VALID_IMAGE_SIZES = ["1K", "2K", "4K"]

VALID_OUTPUT_FORMATS = ["png", "jpeg", "webp"]

# ---------------------------------------------------------------------------
# Credential Resolution
# ---------------------------------------------------------------------------

CREDENTIALS_FILE = Path.home() / ".agents" / "data" / "image-studio" / "credentials.json"

# Support both naming conventions
ENV_KEY_NAMES = ["NANOBANANA_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY"]


def _resolve_api_key() -> str:
    """Resolve API key from environment or credentials file. Never hardcode."""
    for env_name in ENV_KEY_NAMES:
        key = os.environ.get(env_name)
        if key:
            return key

    if CREDENTIALS_FILE.exists():
        try:
            data = json.loads(CREDENTIALS_FILE.read_text())
            key = data.get("api_key")
            if key:
                return key
        except (json.JSONDecodeError, KeyError):
            pass

    print("Error: No API key found.", file=sys.stderr)
    print("Set GEMINI_API_KEY environment variable or run:", file=sys.stderr)
    print("  ./nanobanana auth init --api-key <YOUR_KEY>", file=sys.stderr)
    sys.exit(1)


def save_credentials(api_key: str) -> None:
    """Persist API key to ~/.agents/data/image-studio/credentials.json."""
    CREDENTIALS_FILE.parent.mkdir(parents=True, exist_ok=True)
    CREDENTIALS_FILE.write_text(json.dumps({"api_key": api_key}, indent=2))
    CREDENTIALS_FILE.chmod(0o600)
    print(f"Credentials saved to {CREDENTIALS_FILE}")


def clear_credentials() -> None:
    """Remove stored credentials."""
    if CREDENTIALS_FILE.exists():
        CREDENTIALS_FILE.unlink()
        print("Credentials cleared.")
    else:
        print("No credentials file found.")


def resolve_model(model_input: str) -> str:
    """Resolve model alias to full Gemini model ID."""
    if model_input in MODELS:
        return model_input
    if model_input in MODEL_ALIASES:
        return MODEL_ALIASES[model_input]
    print(f"Error: Unknown model '{model_input}'.", file=sys.stderr)
    print(f"Available models: {', '.join(list(MODELS.keys()) + list(MODEL_ALIASES.keys()))}", file=sys.stderr)
    sys.exit(1)


# ---------------------------------------------------------------------------
# HTTP Engine — Google Generative Language API
# ---------------------------------------------------------------------------

def _post_json(url: str, payload: dict, api_key: str) -> dict:
    """POST JSON to Gemini API. Returns parsed response or exits on error."""
    data = json.dumps(payload).encode("utf-8")
    headers = {
        "x-goog-api-key": api_key,
        "Content-Type": "application/json",
    }

    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            return result
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        try:
            err_json = json.loads(body)
            err_msg = err_json.get("error", {}).get("message", body)
            err_code = err_json.get("error", {}).get("code", e.code)
        except json.JSONDecodeError:
            err_msg = body
            err_code = e.code

        error_hints = {
            400: f"Bad request: {err_msg}",
            401: "Invalid API key. Get one at https://aistudio.google.com/apikey",
            403: f"Permission denied: {err_msg}",
            429: "Rate limit exceeded. Wait and retry.",
            404: f"Model not found: {err_msg}",
        }
        display = error_hints.get(err_code, f"HTTP {err_code}: {err_msg}")
        print(f"Error: {display}", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"Network error: {e.reason}", file=sys.stderr)
        sys.exit(1)


# ---------------------------------------------------------------------------
# Image Generation Core
# ---------------------------------------------------------------------------

def _read_image_as_base64(filepath: str) -> tuple[str, str]:
    """Read an image file, return (base64_data, mime_type)."""
    p = Path(filepath)
    if not p.exists():
        print(f"Error: File not found: {filepath}", file=sys.stderr)
        sys.exit(1)
    if p.stat().st_size > 20 * 1024 * 1024:
        print(f"Error: File exceeds 20MB limit: {filepath}", file=sys.stderr)
        sys.exit(1)

    mime_type = mimetypes.guess_type(filepath)[0] or "image/png"
    b64_data = base64.b64encode(p.read_bytes()).decode("ascii")
    return b64_data, mime_type


def generate_image(
    prompt: str,
    *,
    model: str = DEFAULT_MODEL,
    aspect_ratio: str = "1:1",
    image_size: str = "1K",
    output_format: str = "png",
    image_files: Optional[list[str]] = None,
    output_dir: str = ".",
    output_name: Optional[str] = None,
) -> list[str]:
    """
    Generate or edit images via Google Gemini API (Nano Banana).

    Returns list of saved file paths.
    """
    api_key = _resolve_api_key()
    model = resolve_model(model)
    model_info = MODELS[model]

    # Validate inputs
    if aspect_ratio not in VALID_ASPECT_RATIOS and aspect_ratio != "auto":
        print(f"Error: Invalid aspect ratio '{aspect_ratio}'. Available: {', '.join(VALID_ASPECT_RATIOS)}", file=sys.stderr)
        sys.exit(1)
    if image_size not in VALID_IMAGE_SIZES:
        print(f"Error: Invalid image size '{image_size}'. Must be: {', '.join(VALID_IMAGE_SIZES)}", file=sys.stderr)
        sys.exit(1)
    if output_format not in VALID_OUTPUT_FORMATS:
        print(f"Error: Invalid format '{output_format}'. Must be: {', '.join(VALID_OUTPUT_FORMATS)}", file=sys.stderr)
        sys.exit(1)

    # Build content parts
    parts = []

    # Add reference images first (for image-to-image editing)
    if image_files:
        for fpath in image_files:
            b64_data, mime_type = _read_image_as_base64(fpath)
            parts.append({
                "inline_data": {
                    "mime_type": mime_type,
                    "data": b64_data,
                }
            })

    # Add text prompt
    parts.append({"text": prompt})

    # Build generationConfig
    generation_config: dict = {
        "responseModalities": ["TEXT", "IMAGE"],
    }

    # Image config (aspect ratio + size)
    image_config: dict = {}
    if aspect_ratio != "auto":
        image_config["aspectRatio"] = aspect_ratio
    if model_info["supports_image_size"] and image_size:
        image_config["imageSize"] = image_size
    if image_config:
        generation_config["imageConfig"] = image_config

    # Build request
    payload = {
        "contents": [{"parts": parts}],
        "generationConfig": generation_config,
    }

    # Send request
    url = f"{API_BASE}/{model}:generateContent"
    response = _post_json(url, payload, api_key)

    # Extract results
    return _extract_images(response, output_dir, output_name, output_format)


def _extract_images(
    response: dict,
    output_dir: str,
    output_name: Optional[str],
    output_format: str,
) -> list[str]:
    """Extract inline image data from Gemini API response and save to disk."""
    os.makedirs(output_dir, exist_ok=True)
    saved = []
    text_parts = []

    candidates = response.get("candidates", [])
    if not candidates:
        # Check for prompt feedback (safety block)
        feedback = response.get("promptFeedback", {})
        block_reason = feedback.get("blockReason")
        if block_reason:
            print(f"Error: Prompt blocked by safety filter. Reason: {block_reason}", file=sys.stderr)
            safety_ratings = feedback.get("safetyRatings", [])
            for rating in safety_ratings:
                if rating.get("blocked"):
                    print(f"  - {rating.get('category')}: {rating.get('probability')}", file=sys.stderr)
            sys.exit(1)

        print(f"Error: No candidates in response: {json.dumps(response, indent=2)[:500]}", file=sys.stderr)
        sys.exit(1)

    # Process first candidate
    content = candidates[0].get("content", {})
    parts = content.get("parts", [])

    img_index = 0
    for part in parts:
        if "text" in part:
            text_parts.append(part["text"])
        elif "inlineData" in part or "inline_data" in part:
            inline = part.get("inlineData") or part.get("inline_data", {})
            b64_data = inline.get("data", "")
            mime_type = inline.get("mimeType") or inline.get("mime_type", "image/png")

            if not b64_data:
                continue

            # Determine file extension from mime type
            ext_map = {"image/png": "png", "image/jpeg": "jpeg", "image/webp": "webp"}
            ext = ext_map.get(mime_type, output_format)

            if output_name:
                suffix = f"_{img_index + 1}" if img_index > 0 else ""
                filename = f"{output_name}{suffix}.{ext}"
            else:
                timestamp = int(time.time())
                filename = f"nanobanana_{timestamp}_{img_index + 1}.{ext}"

            filepath = os.path.join(output_dir, filename)

            try:
                with open(filepath, "wb") as f:
                    f.write(base64.b64decode(b64_data))
                saved.append(filepath)
                print(f"Saved: {filepath}")
            except Exception as e:
                print(f"Failed to save image: {e}", file=sys.stderr)

            img_index += 1

    # Print any text the model returned alongside images
    if text_parts:
        print(f"\nModel response: {' '.join(text_parts)}")

    if not saved:
        # Check finish reason
        finish_reason = candidates[0].get("finishReason", "")
        if finish_reason == "IMAGE_SAFETY":
            print("Error: Image generation blocked by safety filter.", file=sys.stderr)
        elif finish_reason == "SAFETY":
            print("Error: Content blocked by safety filter.", file=sys.stderr)
        else:
            print(f"Error: No images in response. Finish reason: {finish_reason}", file=sys.stderr)
            if text_parts:
                print(f"Model said: {' '.join(text_parts)}", file=sys.stderr)
        sys.exit(1)

    return saved


# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------

def list_models() -> None:
    """Print available models with details."""
    print("Available Nano Banana Models (Google Gemini Image Generation):")
    print(f"{'Gemini Model ID':<38} {'Alias':<20} {'Max Res':<10} {'Description'}")
    print("-" * 110)
    for model_id, info in MODELS.items():
        default_marker = " ← default" if model_id == DEFAULT_MODEL else ""
        max_res = info["max_res"] or "1024px"
        print(f"{model_id:<38} {info['alias']:<20} {max_res:<10} {info['description']}{default_marker}")

    print(f"\nShortcut aliases:")
    for alias, model_id in MODEL_ALIASES.items():
        print(f"  {alias:<20} → {model_id}")


def validate_connection() -> bool:
    """Test API key validity by listing models."""
    api_key = _resolve_api_key()
    url = f"{API_BASE}?key={api_key}"

    try:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read().decode("utf-8"))

        models = result.get("models", [])
        image_models = [m["name"] for m in models if "image" in m.get("name", "").lower()]

        if image_models:
            print(f"✓ API key valid. Found {len(image_models)} image model(s).")
            return True
        else:
            print("✓ API key valid. (No image models listed, but auth succeeded.)")
            return True

    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        if e.code == 401 or e.code == 403:
            try:
                err_json = json.loads(body)
                msg = err_json.get("error", {}).get("message", "")
                print(f"✗ Authentication failed: {msg}", file=sys.stderr)
            except json.JSONDecodeError:
                print(f"✗ Authentication failed (HTTP {e.code})", file=sys.stderr)
        else:
            print(f"✗ HTTP {e.code}: {body[:200]}", file=sys.stderr)
        return False
    except urllib.error.URLError as e:
        print(f"✗ Network error: {e.reason}", file=sys.stderr)
        return False
