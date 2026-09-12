from __future__ import annotations

from typing import Any

from p2rln_ref.native_questionnaire import SCHEMA_ID, VERSION, NativeQuestionnaireError, validate_questionnaire

TYPE_MAP = {
    "OPCION_UNICA": "single-choice",
    "OPCION_MULTIPLE": "multiple-choice",
    "VERDADERO_FALSO": "true-false",
    "RESPUESTA_ESCRITA": "text",
    "RELLENAR_HUECOS": "fill-blanks",
    "ORDENAR_ELEMENTOS": "ordering",
    "RELACIONAR_COLUMNAS": "matching",
}
SCORING_MAP = {
    "TODO_O_NADA": "all-or-nothing",
    "PARCIAL_POR_ELEMENTO": "partial-per-item",
    "PARCIAL_CON_PENALIZACION": "partial-with-penalty",
}


class AulaP2PQuestionnaireError(ValueError):
    pass


def _obj(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _items(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _text(value: Any) -> str:
    return str(value or "").strip()


def _norm(value: Any) -> str:
    return " ".join(_text(value).lower().split())


def _positive_number(value: Any, default: float = 0.0) -> float:
    if isinstance(value, bool):
        return default
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return number if number >= 0 else default


def _positive_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def _item_text(item: Any) -> str:
    if isinstance(item, str):
        return item.strip()
    if not isinstance(item, dict):
        return ""
    return _text(item.get("texto") or item.get("label") or item.get("valor") or item.get("text"))


def _raw_identifier(item: Any, index: int) -> str:
    if isinstance(item, dict):
        raw = item.get("id")
        if raw is not None and _text(raw):
            return _text(raw)
    return str(index + 1)


def _portable_items(raw_items: list[Any], prefix: str) -> tuple[list[dict[str, str]], dict[str, str], dict[str, str]]:
    portable: list[dict[str, str]] = []
    by_raw: dict[str, str] = {}
    by_text: dict[str, str] = {}
    for index, raw in enumerate(raw_items):
        text = _item_text(raw)
        if not text:
            continue
        item_id = f"{prefix}-{len(portable) + 1}"
        portable.append({"id": item_id, "text": text})
        by_raw[_raw_identifier(raw, index)] = item_id
        by_text.setdefault(_norm(text), item_id)
    return portable, by_raw, by_text


def _candidate_values(solution: Any) -> list[Any]:
    if isinstance(solution, list):
        return solution
    if not isinstance(solution, dict):
        return [] if solution is None else [solution]
    for key in ("opcionIds", "choiceIds", "opcionesCorrectas", "correctas", "respuestas", "respuestaCorrecta", "respuesta"):
        value = solution.get(key)
        if isinstance(value, list):
            return value
        if value is not None and not isinstance(value, (dict, list)):
            return [value]
    return []


def _resolve_ids(values: list[Any], by_raw: dict[str, str], by_text: dict[str, str]) -> list[str]:
    resolved: list[str] = []
    for value in values:
        raw_key = _text(value)
        item_id = by_raw.get(raw_key) or by_text.get(_norm(value))
        if item_id and item_id not in resolved:
            resolved.append(item_id)
    return resolved


def _common(question: dict[str, Any], index: int, qtype: str) -> dict[str, Any]:
    config = _obj(question.get("configuracion"))
    raw_mode = _text(question.get("modoPuntuacion") or config.get("modoPuntuacion")).upper()
    default_mode = "all-or-nothing" if qtype in {"single-choice", "true-false", "text"} else "partial-per-item"
    out: dict[str, Any] = {
        "id": f"q-{index + 1}",
        "type": qtype,
        "prompt": _text(question.get("enunciado")) or f"Pregunta {index + 1}",
        "points": _positive_number(question.get("puntos"), 1.0),
        "scoring": SCORING_MAP.get(raw_mode, default_mode),
    }
    penalty = _positive_number(question.get("penalizacion", config.get("penalizacion")), 0.0)
    if penalty:
        out["penalty"] = penalty
    time_limit = _positive_int(question.get("tiempo") or config.get("tiempo"))
    if time_limit:
        out["timeLimitSeconds"] = time_limit
    explanation = _text(question.get("explicacion"))
    if explanation:
        out["explanation"] = explanation
    return out


def _choice_question(question: dict[str, Any], index: int, qtype: str) -> dict[str, Any]:
    raw_choices = _items(question.get("opciones"))
    if qtype == "true-false" and len(raw_choices) != 2:
        raw_choices = [
            {"id": "true", "texto": "Verdadero", "valor": True},
            {"id": "false", "texto": "Falso", "valor": False},
        ]
    choices, by_raw, by_text = _portable_items(raw_choices, f"q{index + 1}-choice")
    out = _common(question, index, qtype)
    out["choices"] = choices

    correct: list[str] = []
    for choice_index, raw in enumerate(raw_choices):
        if not isinstance(raw, dict) or raw.get("esCorrecta") is not True:
            continue
        raw_id = _raw_identifier(raw, choice_index)
        item_id = by_raw.get(raw_id) or by_text.get(_norm(_item_text(raw)))
        if item_id and item_id not in correct:
            correct.append(item_id)

    if not correct:
        candidates = _candidate_values(question.get("solucion"))
        correct = _resolve_ids(candidates, by_raw, by_text)
        if qtype == "true-false" and not correct and candidates:
            truthy = candidates[0]
            if isinstance(truthy, bool):
                correct = [choices[0]["id"] if truthy else choices[1]["id"]]
            else:
                normalized = _norm(truthy)
                if normalized in {"true", "verdadero", "1", "si", "sí"}:
                    correct = [choices[0]["id"]]
                elif normalized in {"false", "falso", "0", "no"}:
                    correct = [choices[1]["id"]]

    if qtype in {"single-choice", "true-false"} and len(correct) != 1:
        correct = []
    if qtype == "multiple-choice" and not correct:
        correct = []
    if correct:
        out["solution"] = {"choiceIds": correct}
    return out


def _text_question(question: dict[str, Any], index: int) -> dict[str, Any]:
    out = _common(question, index, "text")
    solution = question.get("solucion")
    accepted: list[str] = []
    if isinstance(solution, dict):
        raw = solution.get("respuestasValidas") or solution.get("acceptedAnswers") or solution.get("respuestas")
        if isinstance(raw, list):
            accepted = [_text(item) for item in raw if _text(item)]
        elif raw is not None and _text(raw):
            accepted = [_text(raw)]
    elif isinstance(solution, list):
        accepted = [_text(item) for item in solution if _text(item)]
    elif solution is not None and _text(solution):
        accepted = [_text(solution)]
    accepted = list(dict.fromkeys(accepted))
    if accepted:
        out["solution"] = {"acceptedAnswers": accepted}
    return out


def _fill_question(question: dict[str, Any], index: int) -> dict[str, Any]:
    out = _common(question, index, "fill-blanks")
    config = _obj(question.get("configuracion"))
    body = _text(config.get("texto"))
    if body:
        out["body"] = body
    raw_blanks = _items(config.get("huecos"))
    blanks: list[dict[str, Any]] = []
    by_raw: dict[str, str] = {}
    for blank_index, raw in enumerate(raw_blanks):
        robj = _obj(raw)
        blank_id = f"q{index + 1}-blank-{blank_index + 1}"
        by_raw[_raw_identifier(raw, blank_index)] = blank_id
        blank: dict[str, Any] = {"id": blank_id}
        label = _text(robj.get("label") or robj.get("texto"))
        if label:
            blank["label"] = label
        options = [str(item).strip() for item in _items(robj.get("opciones")) if str(item).strip()]
        if options:
            blank["options"] = list(dict.fromkeys(options))
        blanks.append(blank)
    if not blanks:
        blanks = [{"id": f"q{index + 1}-blank-1"}]
        by_raw["1"] = blanks[0]["id"]
    out["blanks"] = blanks

    solution = _obj(question.get("solucion"))
    answers: dict[str, list[str]] = {}
    for blank_index, raw in enumerate(_items(solution.get("huecos"))):
        robj = _obj(raw)
        target = by_raw.get(_raw_identifier(raw, blank_index))
        if target is None and blank_index < len(blanks):
            target = blanks[blank_index]["id"]
        valid = robj.get("respuestasValidas") or robj.get("acceptedAnswers") or robj.get("respuestas")
        vals = [_text(item) for item in _items(valid) if _text(item)]
        if not vals and valid is not None and not isinstance(valid, list) and _text(valid):
            vals = [_text(valid)]
        if target and vals:
            answers[target] = list(dict.fromkeys(vals))
    if answers and set(answers) == {blank["id"] for blank in blanks}:
        out["solution"] = {"answers": answers}
    return out


def _ordering_question(question: dict[str, Any], index: int) -> dict[str, Any]:
    out = _common(question, index, "ordering")
    config = _obj(question.get("configuracion"))
    raw_items = _items(config.get("elementos"))
    items, by_raw, by_text = _portable_items(raw_items, f"q{index + 1}-item")
    out["items"] = items
    solution = _obj(question.get("solucion"))
    raw_order = solution.get("ordenCorrecto") or solution.get("order")
    if isinstance(raw_order, list):
        order = _resolve_ids(raw_order, by_raw, by_text)
        if len(order) == len(items) and set(order) == {item["id"] for item in items}:
            out["solution"] = {"order": order}
    return out


def _matching_question(question: dict[str, Any], index: int) -> dict[str, Any]:
    out = _common(question, index, "matching")
    config = _obj(question.get("configuracion"))
    raw_left = _items(config.get("izquierda"))
    raw_right = _items(config.get("derecha"))
    left, left_raw, left_text = _portable_items(raw_left, f"q{index + 1}-left")
    right, right_raw, right_text = _portable_items(raw_right, f"q{index + 1}-right")
    out["left"] = left
    out["right"] = right
    solution = _obj(question.get("solucion"))
    raw_pairs = solution.get("paresCorrectos") or solution.get("pairs")
    pairs: list[dict[str, str]] = []
    for pair in _items(raw_pairs):
        pobj = _obj(pair)
        left_id = _resolve_ids([pobj.get("izquierda") or pobj.get("left")], left_raw, left_text)
        right_id = _resolve_ids([pobj.get("derecha") or pobj.get("right")], right_raw, right_text)
        if left_id and right_id:
            pairs.append({"left": left_id[0], "right": right_id[0]})
    if len(pairs) == len(left) and {pair["left"] for pair in pairs} == {item["id"] for item in left}:
        out["solution"] = {"pairs": pairs}
    return out


def question_from_aulap2p(question: dict[str, Any], index: int) -> dict[str, Any]:
    source_type = _text(question.get("tipo")).upper()
    qtype = TYPE_MAP.get(source_type)
    if qtype is None:
        raise AulaP2PQuestionnaireError(f"unsupported AulaP2P question type: {source_type or '<empty>'}")
    if qtype in {"single-choice", "multiple-choice", "true-false"}:
        return _choice_question(question, index, qtype)
    if qtype == "text":
        return _text_question(question, index)
    if qtype == "fill-blanks":
        return _fill_question(question, index)
    if qtype == "ordering":
        return _ordering_question(question, index)
    if qtype == "matching":
        return _matching_question(question, index)
    raise AulaP2PQuestionnaireError(f"unsupported normalized question type: {qtype}")


def questionnaire_from_aulap2p(quiz: dict[str, Any], *, language: str = "es") -> dict[str, Any]:
    questions: list[dict[str, Any]] = []
    unsupported: list[str] = []
    for index, raw in enumerate(_items(quiz.get("preguntas"))):
        if not isinstance(raw, dict):
            unsupported.append(f"question[{index}] is not an object")
            continue
        try:
            questions.append(question_from_aulap2p(raw, index))
        except AulaP2PQuestionnaireError as exc:
            unsupported.append(str(exc))
    if unsupported:
        raise AulaP2PQuestionnaireError("; ".join(unsupported))
    if not questions:
        raise AulaP2PQuestionnaireError("questionnaire has no portable questions")

    config = _obj(quiz.get("configuracion"))
    embedded_key = all(question.get("solution") is not None for question in questions)
    payload: dict[str, Any] = {
        "schema": SCHEMA_ID,
        "version": VERSION,
        "title": _text(quiz.get("titulo")) or "Cuestionario",
        "language": language,
        "grading": {"mode": "embedded-key" if embedded_key else "host"},
        "presentation": {
            "questionMode": "one-at-a-time",
            "shuffleQuestions": bool(config.get("barajar") or config.get("barajarPreguntas")),
            "showFeedback": "after-submit",
        },
        "questions": questions,
        "extensions": {
            "https://p2rln.org/ext/aulap2p/questionnaire-source": {
                "source": "aulap2p.curso.v1",
                "mapping": "portable-questionnaire-v1"
            }
        },
    }
    description = _text(quiz.get("descripcion"))
    if description:
        payload["description"] = description
    attempts = _positive_int(quiz.get("intentosPermitidos") or config.get("intentosPermitidos"))
    total_time = _positive_int(config.get("tiempoLimite") or config.get("tiempoLimiteSegundos"))
    if attempts or total_time:
        payload["attemptPolicy"] = {}
        if attempts:
            payload["attemptPolicy"]["maxAttempts"] = attempts
        if total_time:
            payload["attemptPolicy"]["timeLimitSeconds"] = total_time
    try:
        validate_questionnaire(payload)
    except NativeQuestionnaireError as exc:
        raise AulaP2PQuestionnaireError(f"native questionnaire validation failed: {exc}") from exc
    return payload
