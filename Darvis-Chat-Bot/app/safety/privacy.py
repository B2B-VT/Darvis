SENSITIVE_TERMS = [
    "adhd", "anxiety", "depression", "disability", "probation",
    "my gpa", "gpa is", "my pid", "student id", "medical", "diagnosed",
]


def privacy_warnings(question: str) -> list[str]:
    q = question.lower()
    if any(term in q for term in SENSITIVE_TERMS):
        return ["Privacy note: you do not need to share personal, medical, or student ID information to use this tool."]
    return []
