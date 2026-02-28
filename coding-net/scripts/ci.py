#!/usr/bin/env python3
"""Coding.net CI Build Management — Jobs, Builds, Triggers, Logs.

Usage via unified CLI:
  ./coding ci jobs --project 12345
  ./coding ci job --project 12345 --id 123
  ./coding ci builds --project 12345 --job 123
  ./coding ci build --project 12345 --id 456
  ./coding ci stage --project 12345 --id 456
  ./coding ci log --project 12345 --id 456 [--raw]
  ./coding ci trigger --project 12345 --job 123 [--ref main]
  ./coding ci stop --project 12345 --id 456
"""

import argparse
import json
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)

from coding_api import CodingClient, Log, output


def cmd_jobs(client: CodingClient, args):
    """List CI jobs in a project."""
    body = {"ProjectId": args.project}
    if args.depot_id:
        body["DepotId"] = args.depot_id
    if args.page_size:
        body["PageSize"] = args.page_size
    if args.page:
        body["PageNumber"] = args.page
    result = client.call("DescribeCodingCIJobs", body)
    output(result)


def cmd_job(client: CodingClient, args):
    """Get CI job detail."""
    result = client.call("DescribeCodingCIJob", {
        "ProjectId": args.project,
        "Id": args.id,
    })
    output(result)


def cmd_builds(client: CodingClient, args):
    """List builds for a CI job."""
    body = {
        "ProjectId": args.project,
        "JobId": args.job,
    }
    if args.page_size:
        body["PageSize"] = args.page_size
    if args.page:
        body["PageNumber"] = args.page
    result = client.call("DescribeCodingCIBuilds", body)
    output(result)


def cmd_build(client: CodingClient, args):
    """Get build detail."""
    result = client.call("DescribeCodingCIBuild", {
        "ProjectId": args.project,
        "BuildId": args.id,
    })
    output(result)


def cmd_stage(client: CodingClient, args):
    """Get build stages."""
    result = client.call("DescribeCodingCIBuildStage", {
        "ProjectId": args.project,
        "BuildId": args.id,
    })
    output(result)


def cmd_log(client: CodingClient, args):
    """Get build log."""
    body = {
        "ProjectId": args.project,
        "BuildId": args.id,
    }
    if args.raw:
        result = client.call("DescribeCodingCIBuildLogRaw", body)
    else:
        result = client.call("DescribeCodingCIBuildLog", body)
    output(result)


def cmd_trigger(client: CodingClient, args):
    """Trigger a CI build."""
    body = {
        "ProjectId": args.project,
        "JobId": args.job,
    }
    if args.ref:
        body["Ref"] = args.ref
    if args.params:
        try:
            body["EnvParams"] = json.loads(args.params)
        except json.JSONDecodeError:
            Log.error(f"Invalid JSON for --params: {args.params}")
            sys.exit(1)
    result = client.call("TriggerCodingCIBuild", body)
    output(result)


def cmd_stop(client: CodingClient, args):
    """Stop a running build."""
    result = client.call("StopCodingCIBuild", {
        "ProjectId": args.project,
        "BuildId": args.id,
    })
    output(result)


# ─── CLI ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(prog="coding ci", description="CI build management")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("jobs", help="List CI jobs")
    p.add_argument("--project", required=True, type=int, help="Project ID")
    p.add_argument("--depot-id", type=int, help="Filter by depot ID")
    p.add_argument("--page-size", type=int, help="Page size")
    p.add_argument("--page", type=int, help="Page number")

    p = sub.add_parser("job", help="Get CI job detail")
    p.add_argument("--project", required=True, type=int, help="Project ID")
    p.add_argument("--id", required=True, type=int, help="Job ID")

    p = sub.add_parser("builds", help="List builds for a job")
    p.add_argument("--project", required=True, type=int, help="Project ID")
    p.add_argument("--job", required=True, type=int, help="Job ID")
    p.add_argument("--page-size", type=int, help="Page size")
    p.add_argument("--page", type=int, help="Page number")

    p = sub.add_parser("build", help="Get build detail")
    p.add_argument("--project", required=True, type=int, help="Project ID")
    p.add_argument("--id", required=True, type=int, help="Build ID")

    p = sub.add_parser("stage", help="Get build stages")
    p.add_argument("--project", required=True, type=int, help="Project ID")
    p.add_argument("--id", required=True, type=int, help="Build ID")

    p = sub.add_parser("log", help="Get build log")
    p.add_argument("--project", required=True, type=int, help="Project ID")
    p.add_argument("--id", required=True, type=int, help="Build ID")
    p.add_argument("--raw", action="store_true", help="Raw log (no formatting)")

    p = sub.add_parser("trigger", help="Trigger a CI build")
    p.add_argument("--project", required=True, type=int, help="Project ID")
    p.add_argument("--job", required=True, type=int, help="Job ID")
    p.add_argument("--ref", help="Git ref (branch/tag)")
    p.add_argument("--params", help="Env params as JSON string")

    p = sub.add_parser("stop", help="Stop a running build")
    p.add_argument("--project", required=True, type=int, help="Project ID")
    p.add_argument("--id", required=True, type=int, help="Build ID")

    args = parser.parse_args()
    client = CodingClient()

    dispatch = {
        "jobs": cmd_jobs,
        "job": cmd_job,
        "builds": cmd_builds,
        "build": cmd_build,
        "stage": cmd_stage,
        "log": cmd_log,
        "trigger": cmd_trigger,
        "stop": cmd_stop,
    }

    dispatch[args.command](client, args)


if __name__ == "__main__":
    main()
