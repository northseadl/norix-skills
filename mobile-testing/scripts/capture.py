#!/usr/bin/env python3
"""
capture — Screenshot, screen recording, and visual comparison.

Handles cross-platform screenshot capture and pixel-level visual diff
for regression detection.
Zero dependencies — uses only Python 3 standard library.
"""

import argparse
import os
import struct
import subprocess
import sys
import zlib
from datetime import datetime
from typing import List, Optional, Tuple

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mt_core import run_cmd, check_tool


def screenshot_android(output_path: str) -> bool:
    """Capture screenshot from Android device."""
    rc, stdout, stderr = run_cmd(["adb", "exec-out", "screencap", "-p"], timeout=10)
    if rc != 0:
        print(f"Error: adb screencap failed: {stderr}", file=sys.stderr)
        return False

    # exec-out may return binary data; write directly
    try:
        result = subprocess.run(
            ["adb", "exec-out", "screencap", "-p"],
            capture_output=True,
            timeout=10,
        )
        if result.returncode != 0:
            print(f"Error: screenshot failed", file=sys.stderr)
            return False

        os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else ".", exist_ok=True)
        with open(output_path, "wb") as f:
            f.write(result.stdout)
        return True
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return False


def screenshot_ios(output_path: str) -> bool:
    """Capture screenshot from iOS simulator."""
    os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else ".", exist_ok=True)
    rc, _, stderr = run_cmd(["xcrun", "simctl", "io", "booted", "screenshot", output_path])
    if rc != 0:
        print(f"Error: simctl screenshot failed: {stderr}", file=sys.stderr)
        return False
    return True


def record_android(output_path: str, duration: int = 10) -> bool:
    """Record screen from Android device."""
    device_path = "/sdcard/mt_recording.mp4"
    rc, _, stderr = run_cmd(
        ["adb", "shell", "screenrecord", "--time-limit", str(duration), device_path],
        timeout=duration + 5,
    )
    if rc != 0:
        print(f"Error: screenrecord failed: {stderr}", file=sys.stderr)
        return False

    os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else ".", exist_ok=True)
    rc, _, _ = run_cmd(["adb", "pull", device_path, output_path])
    run_cmd(["adb", "shell", "rm", device_path])
    return rc == 0


def record_ios(output_path: str, duration: int = 10) -> bool:
    """Record screen from iOS simulator."""
    os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else ".", exist_ok=True)

    # Start recording in background
    proc = subprocess.Popen(
        ["xcrun", "simctl", "io", "booted", "recordVideo", output_path],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    import time
    time.sleep(duration)

    # Stop recording by sending SIGINT
    proc.send_signal(2)  # SIGINT
    proc.wait(timeout=5)
    return os.path.exists(output_path)


def read_png_pixels(path: str) -> Tuple[int, int, bytes]:
    """
    Read a PNG file and return (width, height, raw_pixel_data).
    Minimal PNG decoder — supports 8-bit RGBA and RGB.
    Returns empty data if decoding fails.
    """
    try:
        with open(path, "rb") as f:
            data = f.read()
    except IOError as e:
        print(f"Error reading {path}: {e}", file=sys.stderr)
        return 0, 0, b""

    if data[:8] != b'\x89PNG\r\n\x1a\n':
        print(f"Error: {path} is not a valid PNG", file=sys.stderr)
        return 0, 0, b""

    # Parse IHDR
    offset = 8
    chunk_len = struct.unpack(">I", data[offset:offset+4])[0]
    chunk_type = data[offset+4:offset+8]
    if chunk_type != b'IHDR':
        return 0, 0, b""

    width = struct.unpack(">I", data[offset+8:offset+12])[0]
    height = struct.unpack(">I", data[offset+12:offset+16])[0]
    bit_depth = data[offset+16]
    color_type = data[offset+17]

    # We only handle 8-bit RGB (2) and RGBA (6)
    if bit_depth != 8 or color_type not in (2, 6):
        print(f"Warning: unsupported PNG format (depth={bit_depth}, type={color_type})", file=sys.stderr)
        return width, height, b""

    channels = 4 if color_type == 6 else 3

    # Collect IDAT chunks
    idat_data = b""
    offset = 8
    while offset < len(data):
        chunk_len = struct.unpack(">I", data[offset:offset+4])[0]
        chunk_type = data[offset+4:offset+8]
        chunk_data = data[offset+8:offset+8+chunk_len]

        if chunk_type == b'IDAT':
            idat_data += chunk_data
        elif chunk_type == b'IEND':
            break

        offset += 12 + chunk_len  # 4(len) + 4(type) + data + 4(CRC)

    if not idat_data:
        return width, height, b""

    # Decompress
    try:
        raw = zlib.decompress(idat_data)
    except zlib.error:
        return width, height, b""

    # Remove filter bytes (one per row)
    # This is a simplified decoder that only handles filter type 0 (None)
    pixels = bytearray()
    row_size = width * channels + 1  # +1 for filter byte

    for y in range(height):
        row_start = y * row_size
        if row_start >= len(raw):
            break
        filter_type = raw[row_start]
        row_data = raw[row_start+1:row_start+1+width*channels]

        if filter_type == 0:  # None
            pixels.extend(row_data)
        elif filter_type == 1:  # Sub
            for i in range(len(row_data)):
                a = pixels[-channels] if i >= channels else 0
                pixels.append((row_data[i] + a) & 0xFF)
        elif filter_type == 2:  # Up
            for i in range(len(row_data)):
                b = pixels[-(width*channels)] if y > 0 and len(pixels) >= width*channels else 0
                pixels.append((row_data[i] + b) & 0xFF)
        else:
            # For more complex filters, just copy raw (imperfect but functional)
            pixels.extend(row_data)

    return width, height, bytes(pixels)


def compare_screenshots(
    path_a: str,
    path_b: str,
    threshold: float = 0.01,
    output_path: Optional[str] = None,
) -> dict:
    """
    Compare two screenshots. Returns comparison result dict.

    Since we're zero-dependency, we do a simplified pixel comparison.
    For production quality, the agent should install Pillow or use ImageMagick.
    """
    result = {
        "image_a": path_a,
        "image_b": path_b,
        "threshold": threshold,
    }

    # Check files exist
    if not os.path.exists(path_a):
        result["error"] = f"File not found: {path_a}"
        return result
    if not os.path.exists(path_b):
        result["error"] = f"File not found: {path_b}"
        return result

    # Try using ImageMagick if available (much more accurate)
    if check_tool("compare"):
        # Use ImageMagick compare for accurate diff
        diff_output = output_path or "/tmp/mt_diff.png"
        rc, stdout, _ = run_cmd([
            "compare", "-metric", "RMSE",
            path_a, path_b, diff_output,
        ], timeout=30)

        # ImageMagick compare returns exit code 1 for different images, 0 for identical
        # The metric is in stderr
        import re
        # Parse RMSE value (e.g., "1234.56 (0.0188)")
        match = re.search(r"\(([\d.]+)\)", stdout + _)  # noqa: using _ from run_cmd
        if match:
            rmse_normalized = float(match.group(1))
            result["method"] = "imagemagick"
            result["rmse_normalized"] = rmse_normalized
            result["diff_percentage"] = round(rmse_normalized * 100, 4)
            result["passed"] = rmse_normalized <= threshold
            result["diff_image"] = diff_output
            return result

    # Fallback: file size comparison (rough but zero-dep)
    size_a = os.path.getsize(path_a)
    size_b = os.path.getsize(path_b)
    size_diff_ratio = abs(size_a - size_b) / max(size_a, size_b) if max(size_a, size_b) > 0 else 0

    result["method"] = "file_size_heuristic"
    result["size_a"] = size_a
    result["size_b"] = size_b
    result["size_diff_ratio"] = round(size_diff_ratio, 6)
    result["note"] = "File-size comparison is a rough heuristic. Install ImageMagick for pixel-level diff."
    result["passed"] = size_diff_ratio <= threshold

    return result


def generate_comparison_report(comparison: dict, output_path: Optional[str] = None) -> str:
    """Generate a Markdown report from comparison result."""
    lines = [
        "# Visual Regression Report",
        "",
        f"| Item | Value |",
        f"|------|-------|",
        f"| Image A | `{comparison.get('image_a', 'N/A')}` |",
        f"| Image B | `{comparison.get('image_b', 'N/A')}` |",
        f"| Method | {comparison.get('method', 'N/A')} |",
        f"| Threshold | {comparison.get('threshold', 'N/A')} |",
    ]

    if "error" in comparison:
        lines.extend([
            "",
            f"> ❌ Error: {comparison['error']}",
        ])
    else:
        if comparison.get("method") == "imagemagick":
            lines.append(f"| RMSE | {comparison.get('rmse_normalized', 'N/A')} |")
            lines.append(f"| Diff % | {comparison.get('diff_percentage', 'N/A')}% |")
            if comparison.get("diff_image"):
                lines.append(f"| Diff Image | `{comparison['diff_image']}` |")
        else:
            lines.append(f"| Size A | {comparison.get('size_a', 'N/A')} bytes |")
            lines.append(f"| Size B | {comparison.get('size_b', 'N/A')} bytes |")
            lines.append(f"| Size Diff | {comparison.get('size_diff_ratio', 'N/A')} |")

        lines.extend([
            "",
            f"> {'✅ PASSED' if comparison.get('passed') else '❌ FAILED'} — "
            f"{'images are within threshold' if comparison.get('passed') else 'visual regression detected'}",
        ])

        if comparison.get("note"):
            lines.extend(["", f"> 💡 {comparison['note']}"])

    report = "\n".join(lines)

    if output_path:
        os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else ".", exist_ok=True)
        with open(output_path, "w") as f:
            f.write(report)
        print(f"Report saved to: {output_path}")

    return report


# --- Main ---

def main():
    parser = argparse.ArgumentParser(description="Mobile Testing — Screenshot & Visual Comparison")
    subparsers = parser.add_subparsers(dest="action")

    # No subparser — default behavior based on flags
    parser.add_argument("--platform", choices=["android", "ios"],
                        help="Target platform (for screenshot/record)")
    parser.add_argument("--output", "-o", help="Output file path")
    parser.add_argument("--record", action="store_true", help="Record screen instead of screenshot")
    parser.add_argument("--duration", type=int, default=10,
                        help="Recording duration in seconds (default: 10)")
    parser.add_argument("--compare", nargs=2, metavar=("IMAGE_A", "IMAGE_B"),
                        help="Compare two screenshots")
    parser.add_argument("--threshold", type=float, default=0.01,
                        help="Diff threshold for comparison (default: 0.01)")

    args = parser.parse_args()

    # --- Comparison mode ---
    if args.compare:
        comparison = compare_screenshots(
            args.compare[0], args.compare[1],
            threshold=args.threshold,
            output_path=args.output.replace(".md", "_diff.png") if args.output and args.output.endswith(".md") else None,
        )
        report = generate_comparison_report(comparison, args.output)
        if not args.output:
            print(report)
        sys.exit(0 if comparison.get("passed") else 1)

    # --- Screenshot / Record mode ---
    if not args.platform:
        # Auto-detect platform
        if check_tool("adb"):
            rc, stdout, _ = run_cmd(["adb", "devices"])
            if rc == 0 and len(stdout.strip().split("\n")) > 1:
                args.platform = "android"

        if not args.platform and check_tool("xcrun"):
            rc, stdout, _ = run_cmd(["xcrun", "simctl", "list", "devices", "booted"])
            if rc == 0 and "Booted" in stdout:
                args.platform = "ios"

        if not args.platform:
            print("Error: no platform specified and no active device detected", file=sys.stderr)
            sys.exit(1)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    if args.record:
        output = args.output or f"/tmp/mt_record_{timestamp}.mp4"
        print(f"Recording {args.duration}s on {args.platform}...")
        if args.platform == "android":
            success = record_android(output, args.duration)
        else:
            success = record_ios(output, args.duration)
    else:
        output = args.output or f"/tmp/mt_screenshot_{timestamp}.png"
        print(f"Capturing screenshot on {args.platform}...")
        if args.platform == "android":
            success = screenshot_android(output)
        else:
            success = screenshot_ios(output)

    if success:
        print(f"{'Recording' if args.record else 'Screenshot'} saved: {output}")
    else:
        print("Failed to capture.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
