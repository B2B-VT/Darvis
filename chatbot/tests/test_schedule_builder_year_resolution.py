"""
tests/test_schedule_builder_year_resolution.py

Regression test: the roadmap-aware schedule builder (schedule_builder.py)
must resolve the student's year level to an int regardless of whether it
comes from free-text ("I'm a sophomore") or from the profile-page year
dropdown, which stores capitalized words like "Sophomore". Previously the
profile value was used raw, so int("Sophomore") failed silently -- this
skipped both the roadmap course fold-in AND the inline "what year are
you?" clarification question (since the raw string is still truthy).
"""

from app.features.schedule_builder import _resolve_student_year


def test_resolves_capitalized_profile_year_word_to_int():
    assert _resolve_student_year("build me a schedule", {"year": "Sophomore"}) == 2


def test_falls_back_to_none_when_profile_year_missing():
    assert _resolve_student_year("build me a schedule", {}) is None


def test_falls_back_to_none_when_profile_year_unmapped():
    assert _resolve_student_year("build me a schedule", {"year": "Other"}) is None


def test_free_text_year_takes_priority_over_profile():
    assert _resolve_student_year("I'm a junior", {"year": "Senior"}) == 3
