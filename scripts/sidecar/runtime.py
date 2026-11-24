"""Set portable resource and log paths before the frozen service imports."""
import os
from pathlib import Path
import sys

data_root = Path(os.environ["LOCALAPPDATA"]) / "ENADOX"
os.environ.setdefault("ENADOX_DATA_DIR", str(data_root))
os.environ.setdefault("NUMBA_CACHE_DIR", str(data_root / "numba-cache"))
model = Path(sys._MEIPASS) / "models" / "rvm_mobilenetv3_fp32.onnx"
os.environ.setdefault("ENADOX_RVM", str(model))

