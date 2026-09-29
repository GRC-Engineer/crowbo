"""Read complete, bounded Slack threads under one explicitly configured identity."""

import json
from typing import Literal

import httpx
from pydantic import AwareDatetime, Field, model_validator

from .contracts import Record, now
from .providers import FixedHostTransport
from .runtime import CrowboError, secret


class SlackTarget(Record):
    channel_id: str = Field(pattern=r"^[CG][A-Z0-9]{8,32}$")
    message_ts: str = Field(pattern=r"^\d{10,12}\.\d{6}$")
    title: str = Field(min_length=1, max_length=500)

    @property
    def native_id(self):
        return f"{self.channel_id}:{self.message_ts}"


class SlackSpec(Record):
    name: str = Field(pattern=r"^[a-z0-9-]{1,64}$")
    workspace: str = Field(pattern=r"^[a-z0-9-]{1,100}$")
    team_id: str = Field(pattern=r"^T[A-Z0-9]{8,32}$")
    user_id: str = Field(pattern=r"^[UW][A-Z0-9]{8,32}$")
    targets: tuple[SlackTarget, ...] = Field(min_length=1, max_length=5)
    processors: tuple[
        Literal["turbopuffer", "voyage", "jev", "openai/gpt-6-luna", "@cf/zai-org/glm-5.3-flash"], ...
    ]
    poll_seconds: int = Field(default=900, ge=60, le=86400)
    freshness_seconds: int = Field(default=3600, ge=60, le=86400)
    grant_seconds: int = Field(default=86400, ge=60, le=86400)

    @model_validator(mode="after")
    def bounded(self):
        if len({t.native_id for t in self.targets}) != len(self.targets):
            raise ValueError("Duplicate Slack thread")
        if not {"turbopuffer", "voyage", "jev"}.issubset(self.processors):
            raise ValueError("Sync requires storage, embedding and classification permission")
        if not self.poll_seconds <= self.freshness_seconds <= self.grant_seconds:
            raise ValueError("Poll interval must fit within freshness and access lifetimes")
        return self


class ThreadSnapshot(Record):
    native_id: str
    checked_at: AwareDatetime
    text: str | None = Field(default=None, min_length=1, max_length=40000)
    unavailable: bool = False
    method: Literal["slack_api", "mcp_capture"]

    @model_validator(mode="after")
    def disposition(self):
        if self.unavailable == (self.text is not None):
            raise ValueError("A snapshot must have either text or a confirmed withdrawal")
        return self


class SlackReadError(CrowboError):
    def __init__(self, message, retry_seconds=60):
        super().__init__(message)
        self.retry_seconds = retry_seconds


class SlackReader:
    def __init__(self, runtime, client=None, token=None):
        self.runtime = runtime
        self.client = client or httpx.Client(
            transport=FixedHostTransport("slack.com", 1_000_000),
            timeout=30,
            follow_redirects=False,
            trust_env=False,
        )
        self.token = token

    def _get(self, method, **params):
        call = self.runtime.reserve("slack", method)
        try:
            response = self.client.get(
                f"https://slack.com/api/{method}",
                params=params,
                headers={"Authorization": "Bearer " + (self.token or secret("slack"))},
            )
            self.runtime.receipt(call, {"http_status": response.status_code})
            if response.status_code == 429:
                try:
                    delay = int(response.headers.get("retry-after", "60"))
                except ValueError:
                    delay = 60
                raise SlackReadError("Slack rate limit; retry is scheduled", max(60, min(delay, 86400)))
            if response.status_code != 200:
                raise SlackReadError("Slack request did not succeed")
            body = response.json()
            if not isinstance(body, dict):
                raise TypeError()
            if body.get("ok") is not True:
                code = body.get("error")
                if (
                    code in {"thread_not_found", "channel_not_found", "not_in_channel"}
                    and method == "conversations.replies"
                ):
                    return None
                raise SlackReadError("Slack did not confirm source access or a complete response")
            return body
        except (httpx.HTTPError, ValueError, TypeError):
            raise SlackReadError("Slack transport or response validation failed") from None

    def authenticate(self, spec):
        result = self._get("auth.test")
        if result.get("team_id") != spec.team_id or result.get("user_id") != spec.user_id:
            raise SlackReadError("Slack credential does not match the configured workspace and reader")

    def read(self, target):
        checked_at = now()
        messages, cursors, cursor = {}, set(), ""
        expected_replies = None
        for _ in range(20):
            body = self._get(
                "conversations.replies",
                channel=target.channel_id,
                ts=target.message_ts,
                limit=15,
                cursor=cursor,
            )
            if body is None:
                return ThreadSnapshot(
                    native_id=target.native_id, checked_at=checked_at, unavailable=True, method="slack_api"
                )
            page = body.get("messages")
            if not isinstance(page, list) or not page:
                raise SlackReadError("Slack returned an incomplete thread")
            for message in page:
                if (
                    not isinstance(message, dict)
                    or not isinstance(message.get("ts"), str)
                    or not isinstance(message.get("text"), str)
                ):
                    raise SlackReadError("Slack message is incomplete")
                stamp = message["ts"]
                if stamp == target.message_ts:
                    expected_replies = message.get("reply_count")
                if stamp in messages or message.get("thread_ts", target.message_ts) != target.message_ts:
                    raise SlackReadError("Slack pagination repeated or crossed threads")
                messages[stamp] = {
                    key: message[key]
                    for key in ("ts", "user", "bot_id", "text", "edited", "subtype")
                    if key in message
                }
                if message.get("files"):
                    if not isinstance(message["files"], list) or not all(
                        isinstance(f, dict) for f in message["files"]
                    ):
                        raise SlackReadError("Slack file references are incomplete")
                    messages[stamp]["files"] = [
                        {key: f[key] for key in ("id", "name", "mimetype", "permalink") if key in f}
                        for f in message["files"]
                    ]
            metadata = body.get("response_metadata", {})
            if not isinstance(metadata, dict):
                raise SlackReadError("Slack pagination metadata is invalid")
            cursor = metadata.get("next_cursor", "")
            if not isinstance(cursor, str) or (body.get("has_more") and not cursor) or cursor in cursors:
                raise SlackReadError("Slack pagination is incomplete or cyclic")
            if not cursor:
                break
            cursors.add(cursor)
        else:
            raise SlackReadError("Slack thread exceeds the bounded pagination limit")
        parent = messages.get(target.message_ts)
        if parent is None:
            raise SlackReadError("Slack did not return the requested parent")
        if not isinstance(expected_replies, int) or expected_replies != len(messages) - 1:
            raise SlackReadError("Slack reply count changed or the thread is incomplete; retry")
        text = json.dumps(
            [messages[k] for k in sorted(messages)], sort_keys=True, ensure_ascii=False, separators=(",", ":")
        )
        if len(text) > 40000:
            raise SlackReadError("Slack thread exceeds the source text limit")
        return ThreadSnapshot(
            native_id=target.native_id, checked_at=checked_at, text=text, method="slack_api"
        )

    def close(self):
        self.client.close()


class MCPCapture(Record):
    """An owner-supplied receipt from an authorised MCP read, never a model output."""

    workspace: str
    team_id: str
    user_id: str
    channel_id: str
    message_ts: str
    checked_at: AwareDatetime
    messages: str = Field(min_length=1, max_length=40000)
    pagination_info: str


class CaptureReader:
    def __init__(self, captures):
        self.captures = {f"{c.channel_id}:{c.message_ts}": c for c in captures}
        if len(self.captures) != len(captures):
            raise CrowboError("Duplicate MCP capture")

    def authenticate(self, spec):
        if set(self.captures) != {t.native_id for t in spec.targets}:
            raise CrowboError("Capture set does not match the configured threads")
        if any(
            (c.workspace, c.team_id, c.user_id) != (spec.workspace, spec.team_id, spec.user_id)
            for c in self.captures.values()
        ):
            raise CrowboError("Capture identity does not match the configured source")

    def read(self, target):
        capture = self.captures[target.native_id]
        if capture.pagination_info.strip() != "There are no more messages in this thread.":
            raise SlackReadError("MCP capture does not confirm complete pagination")
        header = capture.messages.split("\n", 5)[:5]
        if "=== THREAD PARENT MESSAGE ===" not in header or f"Message TS: {target.message_ts}" not in header:
            raise SlackReadError("MCP capture does not identify the requested parent")
        return ThreadSnapshot(
            native_id=target.native_id,
            checked_at=capture.checked_at,
            text=capture.messages.strip(),
            method="mcp_capture",
        )

    def close(self):
        pass
