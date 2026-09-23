PROMPTS = {
    "food_classification": (
        "Identify the primary food item in this image. "
        "Return only the most specific food name inside <answer> tags."
    ),
    "produce_variety_classification": (
        "Identify the fruit, vegetable, nut, seed, or fungus variety shown. "
        "Return only the most specific class name inside <answer> tags."
    ),
    "ingredient_recognition": (
        "List the visible food ingredients in this plated meal. "
        "Return JSON inside <answer> tags."
    ),
}


def build(task: str, image_count: int = 1) -> str:
    if task not in PROMPTS:
        raise ValueError(f"unknown task: {task}")
    return PROMPTS[task]