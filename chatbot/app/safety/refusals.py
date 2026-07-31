from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class SafetyDecision:
    blocked: bool
    decision: str = "allow"
    reason: str | None = None
    redirect: str | None = None


_RULES: list[tuple[str, re.Pattern[str], str]] = [
    (
        "system_prompt_extraction",
        re.compile(r"\b(system|developer|hidden|internal)\s+(prompt|instruction|message)s?\b|ignore your instructions|reveal .*prompt", re.I),
        "We can't reveal hidden prompts or internal instructions.",
    ),
    (
        "secret_extraction",
        re.compile(r"\b(api[_ -]?key|supabase key|service role|database credential|secret|token|password)\b", re.I),
        "We can't provide API keys, credentials, tokens, or other secrets.",
    ),
    (
        "private_student_records",
        re.compile(r"\b(all student grades|student grades|student emails|emails of students|students enrolled|private student|student performance by name|what grade did\s+[\w\s]+get|academic records?)\b", re.I),
        "We can't provide private student records or personally identifiable academic information.",
    ),
    (
        "personal_contact_info",
        re.compile(r"\b(home address|personal phone|private phone|personal email|doxx|dox)\b", re.I),
        "We can't provide private personal contact information.",
    ),
    (
        "destructive_or_abusive_database_request",
        re.compile(r"\b(drop\s+table|delete\s+from|truncate\s+table|update\s+\w+\s+set|insert\s+into|sql injection|bypass .*privacy|admin .*bypass|run this sql)\b", re.I),
        "We can't run destructive commands, help with SQL injection, or bypass access controls.",
    ),
    (
        "bulk_or_internal_data_exfiltration",
        re.compile(r"\b(print|dump|export|list|show)\s+(the\s+)?(full|entire|all)\s+(database|db|schema|tables?|retrieved data)\b|\bwhat tables\b|\bdatabase schema\b|\bthe schema\b", re.I),
        "We can't dump internal databases, schemas, or bulk records.",
    ),
    (
        "hidden_internal_notes",
        re.compile(r"\b(hidden notes|internal notes|private notes|professor complaints?|most complaints)\b", re.I),
        "We can't provide hidden/internal notes or unsupported sensitive claims about instructors.",
    ),
    (
        "previous_user_privacy",
        re.compile(r"\b(previous users?|other users?)\b.*\b(questions|chats|messages|history)\b", re.I),
        "We can't reveal other users' questions, chats, or history.",
    ),
    (
        "hallucination_pressure",
        re.compile(r"\b(use .*fallback.*guess|guess missing|invent missing|make up).*\b(grade|distribution|section|professor|course|seat|time)s?\b", re.I),
        "We can't guess missing course, professor, grade, timetable, or schedule data.",
    ),
]


def classify_safety(question: str) -> SafetyDecision:
    q = question or ""
    for reason, pattern, message in _RULES:
        if pattern.search(q):
            return SafetyDecision(
                blocked=True,
                decision="refuse",
                reason=reason,
                redirect=message,
            )
    return SafetyDecision(blocked=False)


def refusal_answer(decision: SafetyDecision) -> str:
    message = decision.redirect or "We can't help with private, unsafe, or unauthorized information."
    return f"{message} We can still help with aggregate course data, public timetable information, and evidence-based planning questions."
