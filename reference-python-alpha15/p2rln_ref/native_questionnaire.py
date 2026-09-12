from __future__ import annotations

import json
import math
import re
import unicodedata
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator, FormatChecker

PROFILE = "https://p2rln.org/profile/native-questionnaire"
SCHEMA_ID = "https://p2rln.org/schema/native-questionnaire/0.4.0"
MEDIA_TYPE = "application/vnd.p2rln.questionnaire+json"
VERSION = "0.4.0"
_SCHEMA_PATH = Path(__file__).resolve().parent / "schemas" / "native-questionnaire.schema.json"
_TOKEN_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]*$")


class NativeQuestionnaireError(ValueError):
    pass


def _schema() -> dict[str, Any]:
    return json.loads(_SCHEMA_PATH.read_text(encoding="utf-8"))


def validate_questionnaire(payload: dict[str, Any]) -> dict[str, Any]:
    """Validate schema plus semantics that JSON Schema cannot express cleanly."""
    validator = Draft202012Validator(_schema(), format_checker=FormatChecker())
    errors = sorted(validator.iter_errors(payload), key=lambda error: list(error.absolute_path))
    if errors:
        lines: list[str] = []
        for error in errors[:20]:
            path = "/".join(str(part) for part in error.absolute_path) or "$"
            lines.append(f"{path}: {error.message}")
        raise NativeQuestionnaireError("invalid native questionnaire:\n" + "\n".join(lines))

    question_ids: set[str] = set()
    embedded_key = payload["grading"]["mode"] == "embedded-key"
    for question in payload["questions"]:
        qid = question["id"]
        if qid in question_ids:
            raise NativeQuestionnaireError(f"duplicate question id: {qid}")
        question_ids.add(qid)
        _validate_question_semantics(question, embedded_key=embedded_key)
    return payload


def _validate_ids(items: list[dict[str, Any]], label: str) -> set[str]:
    ids: set[str] = set()
    for item in items:
        item_id = item["id"]
        if item_id in ids:
            raise NativeQuestionnaireError(f"duplicate {label} id: {item_id}")
        if not _TOKEN_RE.match(item_id):
            raise NativeQuestionnaireError(f"invalid {label} id: {item_id}")
        ids.add(item_id)
    return ids


def _validate_question_semantics(question: dict[str, Any], *, embedded_key: bool) -> None:
    qid = question["id"]
    qtype = question["type"]
    solution = question.get("solution")
    if embedded_key and solution is None:
        raise NativeQuestionnaireError(f"{qid}: embedded-key grading requires a solution")

    if qtype in {"single-choice", "multiple-choice", "true-false"}:
        choice_ids = _validate_ids(question["choices"], f"{qid} choice")
        if qtype == "true-false" and len(choice_ids) != 2:
            raise NativeQuestionnaireError(f"{qid}: true-false requires exactly two choices")
        if solution is not None:
            solution_ids = list(solution["choiceIds"])
            unknown = [item for item in solution_ids if item not in choice_ids]
            if unknown:
                raise NativeQuestionnaireError(f"{qid}: solution references unknown choices: {unknown}")
            if qtype in {"single-choice", "true-false"} and len(solution_ids) != 1:
                raise NativeQuestionnaireError(f"{qid}: {qtype} requires exactly one correct choice")
        return

    if qtype == "fill-blanks":
        blank_ids = _validate_ids(question["blanks"], f"{qid} blank")
        if solution is not None:
            answer_ids = set(solution["answers"])
            if answer_ids != blank_ids:
                missing = sorted(blank_ids - answer_ids)
                extra = sorted(answer_ids - blank_ids)
                raise NativeQuestionnaireError(f"{qid}: blank solution id mismatch; missing={missing}, extra={extra}")
        return

    if qtype == "ordering":
        item_ids = _validate_ids(question["items"], f"{qid} ordering item")
        if solution is not None and set(solution["order"]) != item_ids:
            raise NativeQuestionnaireError(f"{qid}: ordering solution must contain every item exactly once")
        return

    if qtype == "matching":
        left_ids = _validate_ids(question["left"], f"{qid} matching-left")
        right_ids = _validate_ids(question["right"], f"{qid} matching-right")
        if solution is not None:
            pairs = solution["pairs"]
            seen_left: set[str] = set()
            for pair in pairs:
                left = pair["left"]
                right = pair["right"]
                if left not in left_ids or right not in right_ids:
                    raise NativeQuestionnaireError(f"{qid}: matching solution references an unknown item")
                if left in seen_left:
                    raise NativeQuestionnaireError(f"{qid}: matching solution repeats left item {left}")
                seen_left.add(left)
            if seen_left != left_ids:
                raise NativeQuestionnaireError(f"{qid}: matching solution must define one pair for every left item")
        return

    if qtype == "text":
        return

    raise NativeQuestionnaireError(f"{qid}: unsupported question type {qtype}")


def normalize_text(value: Any) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).strip().lower()
    return " ".join(text.split())


def _default_scoring(question: dict[str, Any]) -> str:
    if question["type"] in {"single-choice", "true-false", "text"}:
        return "all-or-nothing"
    return "partial-per-item"


def _bounded_score(question: dict[str, Any], hits: int, errors: int, total: int) -> float:
    points = float(question.get("points", 0))
    if total <= 0 or points <= 0:
        return 0.0
    mode = question.get("scoring") or _default_scoring(question)
    if mode == "all-or-nothing":
        raw = points if hits == total and errors == 0 else 0.0
    else:
        raw = hits * (points / total)
        if mode == "partial-with-penalty":
            raw -= errors * float(question.get("penalty", 0))
    raw = min(points, max(0.0, raw))
    return round(raw + 0.0, 2)


def score_question(question: dict[str, Any], answer: dict[str, Any] | None) -> dict[str, Any]:
    qid = question["id"]
    points = round(float(question.get("points", 0)), 2)
    solution = question.get("solution")
    if solution is None:
        return {
            "questionId": qid,
            "graded": False,
            "correct": None,
            "hits": 0,
            "errors": 0,
            "pointsAwarded": 0.0,
            "pointsPossible": points,
        }

    answer = answer if isinstance(answer, dict) else {}
    qtype = question["type"]
    hits = 0
    errors = 0
    total = 1

    if qtype in {"single-choice", "multiple-choice", "true-false"}:
        selected = {str(item) for item in answer.get("choiceIds", []) if isinstance(item, (str, int))}
        correct_ids = {str(item) for item in solution["choiceIds"]}
        hits = len(selected & correct_ids)
        errors = len(selected - correct_ids)
        total = len(correct_ids) if qtype == "multiple-choice" else 1

    elif qtype == "text":
        actual = normalize_text(answer.get("text", ""))
        accepted = {normalize_text(item) for item in solution["acceptedAnswers"]}
        hits = 1 if actual and actual in accepted else 0
        errors = 0 if hits else 1

    elif qtype == "fill-blanks":
        supplied = answer.get("blanks") if isinstance(answer.get("blanks"), dict) else {}
        expected = solution["answers"]
        total = len(expected)
        for blank_id, valid_answers in expected.items():
            actual = normalize_text(supplied.get(blank_id, ""))
            valid = {normalize_text(item) for item in valid_answers}
            if actual and actual in valid:
                hits += 1
            else:
                errors += 1

    elif qtype == "ordering":
        supplied = answer.get("order") if isinstance(answer.get("order"), list) else []
        expected = solution["order"]
        total = len(expected)
        hits = sum(1 for index, item in enumerate(expected) if index < len(supplied) and str(supplied[index]) == str(item))
        errors = total - hits

    elif qtype == "matching":
        supplied = answer.get("pairs") if isinstance(answer.get("pairs"), dict) else {}
        expected = {pair["left"]: pair["right"] for pair in solution["pairs"]}
        total = len(expected)
        hits = sum(1 for left, right in expected.items() if str(supplied.get(left, "")) == str(right))
        errors = total - hits

    else:
        raise NativeQuestionnaireError(f"{qid}: unsupported question type {qtype}")

    awarded = _bounded_score(question, hits, errors, total)
    correct = math.isclose(awarded, points, abs_tol=1e-9) and errors == 0
    return {
        "questionId": qid,
        "graded": True,
        "correct": correct,
        "hits": hits,
        "errors": errors,
        "pointsAwarded": awarded,
        "pointsPossible": points,
    }


def score_questionnaire(payload: dict[str, Any], answers: dict[str, Any] | None) -> dict[str, Any]:
    validate_questionnaire(payload)
    answers = answers if isinstance(answers, dict) else {}
    if payload["grading"]["mode"] == "host":
        results = [
            {
                "questionId": question["id"],
                "graded": False,
                "correct": None,
                "hits": 0,
                "errors": 0,
                "pointsAwarded": 0.0,
                "pointsPossible": round(float(question.get("points", 0)), 2),
            }
            for question in payload["questions"]
        ]
        return {
            "graded": False,
            "raw": 0.0,
            "max": round(sum(item["pointsPossible"] for item in results), 2),
            "normalized": None,
            "questions": results,
        }
    results = [score_question(question, answers.get(question["id"])) for question in payload["questions"]]
    max_score = round(sum(item["pointsPossible"] for item in results), 2)
    raw = round(sum(item["pointsAwarded"] for item in results), 2)
    all_graded = all(item["graded"] for item in results)
    normalized = None if not all_graded or max_score <= 0 else round(raw / max_score, 6)
    return {
        "graded": all_graded,
        "raw": raw,
        "max": max_score,
        "normalized": normalized,
        "questions": results,
    }
