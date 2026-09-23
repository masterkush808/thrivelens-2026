import os
import sys

# Set mock mode for all tests so Settings validation passes (real serving
# without mock requires token auth, which is not relevant for unit tests).
os.environ.setdefault("THRIVELENS_SERVING_MOCK", "1")
os.environ.setdefault("THRIVELENS_SERVING_AUTH", "dev")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
