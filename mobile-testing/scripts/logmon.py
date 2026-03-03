#!/usr/bin/env python3
"""
logmon — Log monitoring with automatic crash/ANR detection.

Captures filtered application logs and automatically identifies crash patterns,
ANRs, OOM errors, and other critical issues.
Zero dependencies — uses only Python 3 standard library.
"""

import argparse
import json
import os
import re
import signal
import subprocess
import sys
import time
from datetime import datetime
from typing import Dict, List, Optional

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mt_core import run_cmd, check_tool


# --- Crash Pattern Definitions ---

CRASH_PATTERNS = [
    {
        "name": "Java Exception",
        "severity": "critical",
        "patterns": [
            r"FATAL EXCEPTION",
            r"java\.lang\.\w+Exception",
            r"java\.lang\.\w+Error",
            r"AndroidRuntime.*FATAL",
        ],
    },
    {
        "name": "Native Crash",
        "severity": "critical",
        "patterns": [
            r"signal \d+ \(SIG\w+\)",
            r"SIGABRT",
            r"SIGSEGV",
            r"SIGBUS",
            r"backtrace:",
            r"DEBUG.*pid.*tid.*signal",
        ],
    },
    {
        "name": "ANR",
        "severity": "critical",
        "patterns": [
            r"ANR in",
            r"Input dispatching timed out",
            r"Application Not Responding",
        ],
    },
    {
        "name": "Out of Memory",
        "severity": "critical",
        "patterns": [
            r"OutOfMemoryError",
            r"OOM\b",
            r"Failed to allocate",
            r"Throwing OutOfMemoryError",
        ],
    },
    {
        "name": "Strict Mode Violation",
        "severity": "warning",
        "patterns": [
            r"StrictMode\s+policy\s+violation",
            r"StrictMode.*penalty",
        ],
    },
    {
        "name": "Network Error",
        "severity": "warning",
        "patterns": [
            r"java\.net\.\w+Exception",
            r"UnknownHostException",
            r"SocketTimeoutException",
            r"ConnectException",
            r"SSLException",
        ],
    },
    {
        "name": "Security Exception",
        "severity": "warning",
        "patterns": [
            r"SecurityException",
            r"Permission denial",
            r"requires.*permission",
        ],
    },
]


def analyze_line(line: str) -> List[Dict]:
    """Check a log line against all crash patterns. Returns matched patterns."""
    matches = []
    for pattern_group in CRASH_PATTERNS:
        for p in pattern_group["patterns"]:
            if re.search(p, line, re.IGNORECASE):
                matches.append({
                    "name": pattern_group["name"],
                    "severity": pattern_group["severity"],
                    "pattern": p,
                    "line": line.strip(),
                })
                break  # One match per group is enough
    return matches


def collect_android_logs(
    package: str,
    duration: int = 30,
    log_level: str = "V",
) -> List[str]:
    """Collect Android logcat for a package."""
    # Clear log buffer first
    run_cmd(["adb", "logcat", "-c"])
    time.sleep(0.5)

    # Get PID
    rc, stdout, _ = run_cmd(["adb", "shell", "pidof", package])
    pid = stdout.strip() if rc == 0 and stdout.strip() else None

    # Build logcat command
    cmd = ["adb", "logcat", f"*:{log_level}", "-v", "time"]
    if pid:
        cmd.extend(["--pid", pid])

    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

        lines = []
        start = time.time()

        while time.time() - start < duration:
            line = proc.stdout.readline()
            if line:
                lines.append(line)
            else:
                time.sleep(0.1)

        proc.send_signal(signal.SIGINT)
        proc.wait(timeout=3)

        return lines
    except Exception as e:
        print(f"Error collecting logs: {e}", file=sys.stderr)
        return []


def collect_ios_logs(
    bundle_id: str,
    duration: int = 30,
) -> List[str]:
    """Collect iOS simulator logs for a bundle ID."""
    cmd = [
        "xcrun", "simctl", "spawn", "booted", "log", "stream",
        "--predicate", f'subsystem == "{bundle_id}" OR process == "{bundle_id}"',
        "--level", "error",
    ]

    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

        lines = []
        start = time.time()

        while time.time() - start < duration:
            line = proc.stdout.readline()
            if line:
                lines.append(line)
            else:
                time.sleep(0.1)

        proc.send_signal(signal.SIGINT)
        proc.wait(timeout=3)

        return lines
    except Exception as e:
        print(f"Error collecting logs: {e}", file=sys.stderr)
        return []


def analyze_logs(log_lines: List[str]) -> Dict:
    """Analyze log lines for crashes, ANRs, and other issues."""
    issues = []
    context_buffer = []
    context_size = 5

    for i, line in enumerate(log_lines):
        matches = analyze_line(line)
        if matches:
            # Collect surrounding context
            start = max(0, i - context_size)
            end = min(len(log_lines), i + context_size + 1)
            context = [l.strip() for l in log_lines[start:end]]

            for match in matches:
                issues.append({
                    **match,
                    "line_number": i + 1,
                    "context": context,
                })

    # Deduplicate similar issues
    seen = set()
    unique_issues = []
    for issue in issues:
        key = (issue["name"], issue["pattern"])
        if key not in seen:
            seen.add(key)
            unique_issues.append(issue)

    return {
        "total_lines": len(log_lines),
        "issues": unique_issues,
        "critical_count": sum(1 for i in unique_issues if i["severity"] == "critical"),
        "warning_count": sum(1 for i in unique_issues if i["severity"] == "warning"),
    }


def generate_log_report(
    package: str,
    platform: str,
    analysis: Dict,
    output_path: Optional[str] = None,
) -> str:
    """Generate Markdown crash/log analysis report."""
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    lines = [
        f"# Log Analysis Report — `{package}`",
        "",
        "| Item | Value |",
        "|------|-------|",
        f"| Platform | {platform} |",
        f"| Lines Analyzed | {analysis['total_lines']} |",
        f"| Critical Issues | {analysis['critical_count']} |",
        f"| Warnings | {analysis['warning_count']} |",
        f"| Analyzed At | {now} |",
        "",
    ]

    if not analysis["issues"]:
        lines.extend([
            "> ✅ No crashes, ANRs, or critical issues detected.",
            "",
        ])
    else:
        # Critical issues first
        critical = [i for i in analysis["issues"] if i["severity"] == "critical"]
        warnings = [i for i in analysis["issues"] if i["severity"] == "warning"]

        if critical:
            lines.extend([
                "## 🔴 Critical Issues",
                "",
            ])
            for issue in critical:
                lines.extend([
                    f"### {issue['name']}",
                    "",
                    f"**Pattern**: `{issue['pattern']}`  ",
                    f"**Line**: {issue['line_number']}",
                    "",
                    "**Match**:",
                    f"```",
                    issue["line"],
                    "```",
                    "",
                    "**Context**:",
                    "```",
                    *issue.get("context", []),
                    "```",
                    "",
                ])

        if warnings:
            lines.extend([
                "## 🟡 Warnings",
                "",
            ])
            for issue in warnings:
                lines.extend([
                    f"### {issue['name']}",
                    "",
                    f"**Pattern**: `{issue['pattern']}`  ",
                    f"**Line**: {issue['line_number']}",
                    "",
                    "```",
                    issue["line"],
                    "```",
                    "",
                ])

    report = "\n".join(lines)

    if output_path:
        os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else ".", exist_ok=True)
        with open(output_path, "w") as f:
            f.write(report)
        print(f"Report saved to: {output_path}")

    return report


# --- Main ---

def main():
    parser = argparse.ArgumentParser(description="Mobile Testing — Log Monitor & Crash Detector")
    parser.add_argument("--package", required=True, help="App package/bundle ID")
    parser.add_argument("--platform", choices=["android", "ios"], required=True,
                        help="Target platform")
    parser.add_argument("--duration", type=int, default=30,
                        help="Log capture duration in seconds (default: 30)")
    parser.add_argument("--output", "-o", help="Output file path for report")
    parser.add_argument("--json", action="store_true", help="Output raw analysis as JSON")
    parser.add_argument("--log-level", default="V", choices=["V", "D", "I", "W", "E"],
                        help="Minimum log level (Android, default: V)")

    args = parser.parse_args()

    # Validate tools
    if args.platform == "android" and not check_tool("adb"):
        print("Error: adb not found.", file=sys.stderr)
        sys.exit(1)
    if args.platform == "ios" and not check_tool("xcrun"):
        print("Error: xcrun not found.", file=sys.stderr)
        sys.exit(1)

    print(f"Capturing logs for {args.package} ({args.duration}s)...")

    if args.platform == "android":
        log_lines = collect_android_logs(args.package, args.duration, args.log_level)
    else:
        log_lines = collect_ios_logs(args.package, args.duration)

    print(f"Captured {len(log_lines)} lines. Analyzing...")
    analysis = analyze_logs(log_lines)

    if args.json:
        print(json.dumps(analysis, indent=2, ensure_ascii=False))
    else:
        report = generate_log_report(args.package, args.platform, analysis, args.output)
        if not args.output:
            print("\n" + report)

    # Exit code reflects severity
    if analysis["critical_count"] > 0:
        sys.exit(2)
    elif analysis["warning_count"] > 0:
        sys.exit(1)
    else:
        sys.exit(0)


if __name__ == "__main__":
    main()
