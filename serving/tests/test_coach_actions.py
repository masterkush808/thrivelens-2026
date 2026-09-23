import pytest

from app.coach import _extract_actions, cap_chat_context
from app.contract import CoachMessage


def test_valid_log_meal_action_produces_payload():
    reply = 'Here is a balanced option:\n{"log_meal": {"food_name": "chicken breast", "amount_g": 180, "meal_type": "lunch"}}'
    actions = _extract_actions(reply)
    assert len(actions) == 1
    assert actions[0].type == "log_meal"
    assert actions[0].payload.food_name == "chicken breast"
    assert actions[0].payload.amount_g == 180.0
    assert actions[0].payload.meal_type == "lunch"


def test_unknown_food_abstains():
    reply = '{"log_meal": {"food_name": "xyzzy no such food", "amount_g": 100, "meal_type": "snack"}}'
    actions = _extract_actions(reply)
    assert actions == []


def test_bad_amount_abstains():
    reply = '{"log_meal": {"food_name": "egg", "amount_g": 0, "meal_type": "lunch"}}'
    actions = _extract_actions(reply)
    assert actions == []

    reply2 = '{"log_meal": {"food_name": "egg", "amount_g": 5000, "meal_type": "lunch"}}'
    assert _extract_actions(reply2) == []


def test_invalid_meal_type_ignored():
    reply = '{"log_meal": {"food_name": "egg", "amount_g": 100, "meal_type": "brunch"}}'
    assert _extract_actions(reply) == []


def test_malformed_json_ignored():
    reply = '{"log_meal": {"food_name": "egg", "amount_g": 100, "meal_type": "lunch"'
    assert _extract_actions(reply) == []


def _m(role, content):
    return CoachMessage(role=role, content=content)


def test_cap_chat_context_keeps_head_and_tail():
    msgs = [_m("user", "g"), _m("user", "a b c"), _m("assistant", "reply"), _m("user", "new")]
    capped = cap_chat_context(msgs, 20)
    assert capped[0] is msgs[0]
    assert capped[-1] is msgs[-1]
    assert sum(len(m.content) for m in capped) <= 20


def test_cap_chat_context_drops_oldest_middle():
    msgs = [_m("user", "g"), _m("user", "old long context " * 10), _m("assistant", "mid"), _m("user", "new")]
    capped = cap_chat_context(msgs, 40)
    assert sum(len(m.content) for m in capped) <= 40
    assert "new" in [m.content for m in capped]
    assert capped[0].content == "g"


def test_cap_chat_context_irreducible_unchanged():
    msgs = [_m("user", "big " * 500), _m("user", "tail")]
    capped = cap_chat_context(msgs, 100)
    assert capped == msgs


def test_cap_chat_context_single_and_empty():
    single = [_m("user", "hello")]
    assert cap_chat_context(single, 5) == single
    assert cap_chat_context([], 5) == []
    assert cap_chat_context(single, 1) == single
