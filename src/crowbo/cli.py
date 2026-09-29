import argparse
import json
import logging
import os
import uuid
from pathlib import Path

from pydantic import ValidationError

from .contracts import SourceBatch
from .decision import Decision, DecisionRequest
from .decision_page import export_decision_page
from .evidence import Evidence
from .feedback import Feedback, FeedbackRequest
from .providers import Jev, TurbopufferStore
from .questions import DEFAULT_QUESTIONS, QuestionSet
from .review import Reasoner, Review, ReviewRequest
from .runtime import CrowboError, Runtime, Settings, read_private
from .slack import CaptureReader, MCPCapture, SlackReader, SlackSpec
from .sync import SlackSync


def main(argv=None):
    parser = argparse.ArgumentParser(description="Crowbo single-operator private evidence pilot")
    parser.add_argument("--settings", type=Path, required=True)
    sub = parser.add_subparsers(dest="operation", required=True)
    experiment = sub.add_parser("create-experiment")
    experiment.add_argument("--max-requests", type=int, required=True)
    experiment.add_argument("--max-models", type=int, required=True)
    sub.add_parser("experiment-status")
    ingest = sub.add_parser("ingest")
    ingest.add_argument("batch", type=Path)
    sub.add_parser("resume")
    sub.add_parser("list")
    inspect = sub.add_parser("inspect")
    inspect.add_argument("logical_id")
    search = sub.add_parser("search")
    search.add_argument("--query-file", type=Path, required=True)
    search.add_argument("--mode", choices=["semantic", "keyword"], default="semantic")
    review = sub.add_parser("review")
    review.add_argument("request", type=Path)
    history = sub.add_parser("inspect-review")
    history.add_argument("review_id")
    decision = sub.add_parser("decide")
    decision.add_argument("request", type=Path)
    decision_history = sub.add_parser("inspect-decision")
    decision_history.add_argument("review_id")
    export = sub.add_parser("export-decision")
    export.add_argument("review_ids", nargs="+")
    export.add_argument("--output", type=Path, required=True)
    feedback = sub.add_parser("record-feedback")
    feedback.add_argument("request", type=Path)
    feedback_history = sub.add_parser("inspect-feedback")
    feedback_history.add_argument("feedback_id")
    sync = sub.add_parser("sync-slack")
    sync.add_argument("spec", type=Path)
    sync.add_argument("--capture", type=Path)
    sync.add_argument(
        "--force",
        action="store_true",
        help="Refresh or retry preparation early; does not bypass upstream retry limits",
    )
    status = sub.add_parser("sync-status")
    status.add_argument("spec", type=Path)
    args = parser.parse_args(argv)
    os.umask(0o077)
    logging.getLogger("httpx").setLevel(logging.CRITICAL)
    logging.getLogger("turbopuffer").setLevel(logging.CRITICAL)
    runtime = store = jev = reasoner = slack = None
    try:
        settings = Settings.model_validate_json(read_private(args.settings))
        spec = (
            SlackSpec.model_validate_json(read_private(args.spec, 20000))
            if args.operation in {"sync-slack", "sync-status"}
            else None
        )
        captures = (
            [MCPCapture.model_validate(c) for c in json.loads(read_private(args.capture))]
            if args.operation == "sync-slack" and args.capture
            else None
        )
        batch = (
            SourceBatch.model_validate_json(read_private(args.batch)) if args.operation == "ingest" else None
        )
        questions = (
            QuestionSet.model_validate_json(read_private(settings.questions_file, 20000))
            if settings.questions_file
            else DEFAULT_QUESTIONS
        )
        request = (
            {"decide": DecisionRequest, "review": ReviewRequest, "record-feedback": FeedbackRequest}[
                args.operation
            ].model_validate_json(read_private(args.request, 30000))
            if args.operation in {"review", "decide", "record-feedback"}
            else None
        )
        runtime = Runtime(settings)
        with runtime.locked():
            if args.operation in {"create-experiment", "experiment-status"}:
                result = (
                    runtime.create_experiment(args.max_requests, args.max_models)
                    if args.operation == "create-experiment"
                    else runtime.experiment_status()
                )
                print(json.dumps(result))
                return 0
            store = TurbopufferStore(runtime)
            if args.operation in {"ingest", "resume", "sync-slack"}:
                jev = Jev(runtime, questions=questions)
            app = Evidence(settings, store, jev, questions)
            if args.operation == "export-decision":
                if not 1 <= len(args.review_ids) <= 5:
                    raise CrowboError("Select one to five saved versions")
                results = [Decision(app, None).inspect(key) for key in args.review_ids]
                notes = [
                    Feedback(app).inspect(key)
                    for key in dict.fromkeys(
                        r["decision"]["request"].get("prior_feedback_id") for r in results
                    )
                    if key
                ]
                path = export_decision_page(args.output, results, notes)
                print(json.dumps({"private_snapshot": str(path), "versions": len(results)}))
                return 0
            if args.operation in {"sync-slack", "sync-status"}:
                slack = CaptureReader(captures) if captures is not None else SlackReader(runtime)
                sync = SlackSync(app, spec, slack)
                values = [sync.status() if args.operation == "sync-status" else sync.run(force=args.force)]
            elif args.operation == "ingest":
                values = app.ingest(batch)
            elif args.operation == "resume":
                values = app.resume()
            elif args.operation == "inspect":
                values = [app.inspect(args.logical_id).model_dump(mode="json")]
            elif args.operation == "list":
                values = [v.model_dump(mode="json") for v in app.list_current()]
            elif args.operation == "record-feedback":
                values = [Feedback(app).record(request)]
            elif args.operation == "inspect-feedback":
                values = [Feedback(app).inspect(args.feedback_id)]
            elif args.operation == "review":
                reasoner = Reasoner(runtime)
                values = [Review(app, reasoner).run(request)]
            elif args.operation == "decide":
                reasoner = Reasoner(runtime)
                values = [Decision(app, reasoner).run(request)]
            elif args.operation == "inspect-decision":
                values = [Decision(app, None).inspect(args.review_id)]
            elif args.operation == "inspect-review":
                values = [Review(app, None).inspect(args.review_id)]
            else:
                query = read_private(args.query_file, 4000).decode()
                values = [v.model_dump(mode="json") for v in app.search(query, args.mode)]
            name = args.operation + "-" + uuid.uuid4().hex[:12] + ".json"
            report = runtime.write_report(
                name,
                {
                    "operation": args.operation,
                    "population_complete": False,
                    "retrieval_mode": args.mode if args.operation == "search" else None,
                    "records": values,
                },
            )
            pending = sum(
                bool(v.get("errors")) or v.get("status") in {"conflicting_revision", "access_denied"}
                for v in values
            )
            print(
                json.dumps(
                    {
                        "operation": args.operation,
                        "record_count": len(values),
                        "records_with_pending_work": pending,
                        "private_report": str(report),
                    }
                )
            )
            return 2 if pending else 0
    except ValidationError:
        print(
            json.dumps({"error": "Input or stored record failed schema validation; no input values printed"})
        )
        return 2
    except CrowboError as error:
        print(json.dumps({"error": str(error)}))
        return 2
    except (OSError, ValueError, KeyError, TypeError):
        print(
            json.dumps(
                {"error": "Local input, provider response or private output is unavailable or invalid"}
            )
        )
        return 2
    finally:
        for resource in (slack, reasoner, jev, store, runtime):
            if resource:
                resource.close()


if __name__ == "__main__":
    raise SystemExit(main())
