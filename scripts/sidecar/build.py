"""Build the Windows sidecar from the read-only reference checkout."""
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
REFERENCE = ROOT.parent / "enadox-video-embed"
WORK = ROOT / ".cache" / "sidecar"
BUILD_ENV = WORK / "venv"
PYTHON = BUILD_ENV / "Scripts" / "python.exe"
MODEL = REFERENCE / "models" / "rvm" / "rvm_mobilenetv3_fp32.onnx"


def main():
    if os.name != "nt" or sys.version_info[:2] != (3, 12):
        sys.exit("Run with Windows Python 3.12.")
    WORK.mkdir(parents=True, exist_ok=True)
    if not PYTHON.exists():
        subprocess.run([sys.executable, "-m", "venv", str(BUILD_ENV)], check=True)
    subprocess.run([PYTHON, "-m", "pip", "install", "-r",
                    Path(__file__).with_name("requirements.txt")], check=True)

    # Adapt the reference service's fixed log root in the build copy only.
    src = REFERENCE / "src"
    upstream = (src / "enadox_service.py").read_text(encoding="utf-8")
    fixed = 'ENV=r"C:/Users/Arvin/OneDrive/Desktop/CovertDefensesLLC/enadox-video-embed"'
    if upstream.count(fixed) != 1:
        sys.exit("The service log-root declaration changed. Review it before packaging.")
    staged = WORK / "enadox_service.py"
    staged.write_text(upstream.replace(fixed, 'ENV=os.environ["ENADOX_DATA_DIR"]'),
                      encoding="utf-8")
    subprocess.run([
        PYTHON, "-m", "PyInstaller", "--noconfirm", "--onefile",
        "--name", "enadox-service", "--workpath", WORK / "work", "--specpath", WORK,
        "--distpath", ROOT / "resources" / "python-bundle", "--paths", src,
        "--runtime-hook", Path(__file__).with_name("runtime.py"),
        "--collect-all", "openvino", "--collect-submodules", "uvicorn",
        "--add-data", f"{MODEL}{os.pathsep}models",
        "--add-data", f"{src / 'ecc_fast.py'}{os.pathsep}.", staged,
    ], check=True, env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"})


if __name__ == "__main__":
    main()

