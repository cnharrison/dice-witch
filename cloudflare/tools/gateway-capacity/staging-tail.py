import codecs
import json
import os
import sys
from urllib.parse import urlsplit

secrets = json.loads(os.environ["BENCHMARK_REDACTIONS"])
decoder = json.JSONDecoder()
utf8 = codecs.getincrementaldecoder("utf-8")()
buffer = ""


def redact(value):
    text = str(value)
    for secret in secrets:
        text = text.replace(secret, "[redacted]")
    return text[:1000]


def sanitize(value):
    event = value.get("event") or {}
    request = event.get("request") or {}
    return {
        **{key: value.get(key) for key in ["outcome", "eventTimestamp", "scriptName", "scriptVersion", "cpuTime", "wallTime", "truncated"]},
        "path": redact(urlsplit(request.get("url", "")).path),
        "exceptions": [{"name": redact(item.get("name", "")), "message": redact(item.get("message", ""))} for item in value.get("exceptions", [])],
        "logs": [{"level": item.get("level"), "message": [redact(message) for message in item.get("message", [])[:16]]} for item in value.get("logs", [])[:64]],
    }


for chunk in iter(lambda: sys.stdin.buffer.read1(65536), b""):
    buffer += utf8.decode(chunk)
    if len(buffer) > 2 * 1024 * 1024:
        raise RuntimeError("Tail record exceeded the parser budget")
    while buffer.strip():
        buffer = buffer.lstrip()
        try:
            value, end = decoder.raw_decode(buffer)
        except json.JSONDecodeError:
            break
        print(json.dumps(sanitize(value)), flush=True)
        buffer = buffer[end:]

buffer += utf8.decode(b"", final=True)
if buffer.strip():
    raise RuntimeError("Tail ended with an incomplete record")
