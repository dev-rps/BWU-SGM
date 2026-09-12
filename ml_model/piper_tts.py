"""
piper_tts.py — Production Piper TTS Engine for Safety Guardian (Momo AI)

Requirements implemented:
- Uses Ryan High as default voice model (en_US-ryan-high.onnx + en_US-ryan-high.onnx.json).
- Initializes the Piper model ONCE during backend startup (singleton).
- Caches generated audio in memory for high-performance sub-millisecond responses.
- Validates that both .onnx and .json exist before initialization.
- Logs a clear success message when Ryan High model loads successfully.
- Logs clear errors if loading fails so caller can seamlessly fallback without crashing.
- Cross-platform: works on both Windows and Linux, checking primary download path,
  environment variables, and bundled project paths.
- Modular design: future voice changes only require updating model paths.
"""

import os
import io
import wave
import hashlib
import logging
from pathlib import Path
from typing import Optional, Tuple, Dict

logger = logging.getLogger("piper_tts")
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter("[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s")
    handler.setFormatter(formatter)
    logger.addHandler(handler)
logger.setLevel(logging.INFO)

# Primary model paths (Windows user download location)
PRIMARY_MODEL_PATH = Path(r"C:\Users\Ankan Haldar\Downloads\en_US-ryan-high.onnx")
PRIMARY_CONFIG_PATH = Path(r"C:\Users\Ankan Haldar\Downloads\en_US-ryan-high.onnx.json")

# Bundled fallback model paths (repository directory for Linux/Docker/Cloud hosting)
BASE_DIR = Path(__file__).resolve().parent
BUNDLED_MODEL_PATH = BASE_DIR / "voices" / "en_US-ryan-high.onnx"
BUNDLED_CONFIG_PATH = BASE_DIR / "voices" / "en_US-ryan-high.onnx.json"


class PiperTTSManager:
    """
    Singleton manager for Piper TTS with Ryan High voice.
    Loads ONNX model once at startup and serves cached audio.
    """
    _instance: Optional["PiperTTSManager"] = None

    def __init__(self, model_path: Optional[str] = None, config_path: Optional[str] = None):
        self.custom_model_path = model_path
        self.custom_config_path = config_path
        self.active_model_path: Optional[Path] = None
        self.active_config_path: Optional[Path] = None
        self.voice = None
        self.is_ready = False
        self.init_error: Optional[str] = None
        self._cache: Dict[str, bytes] = {}
        self.max_cache_size = 500

    @classmethod
    def get_instance(cls) -> "PiperTTSManager":
        if cls._instance is None:
            cls._instance = PiperTTSManager()
        return cls._instance

    def _resolve_paths(self) -> Tuple[Optional[Path], Optional[Path]]:
        """
        Resolves model and config paths with cross-platform fallbacks:
        1. Explicit custom paths passed into constructor
        2. Environment variables (PIPER_MODEL_PATH, PIPER_CONFIG_PATH)
        3. Primary Windows Download paths (as specified by user)
        4. Bundled repository paths (for Linux, Docker, cloud hosting)
        """
        # 1. Custom explicit
        if self.custom_model_path and self.custom_config_path:
            return Path(self.custom_model_path), Path(self.custom_config_path)

        # 2. Environment variables
        env_model = os.environ.get("PIPER_MODEL_PATH")
        env_config = os.environ.get("PIPER_CONFIG_PATH")
        if env_model and env_config:
            p_model = Path(env_model)
            p_config = Path(env_config)
            if p_model.is_file() and p_config.is_file():
                return p_model, p_config

        # 3. Primary Windows Download path
        if PRIMARY_MODEL_PATH.is_file() and PRIMARY_CONFIG_PATH.is_file():
            return PRIMARY_MODEL_PATH, PRIMARY_CONFIG_PATH

        # 4. Bundled repository path (works in Linux, Docker, hosted environments)
        if BUNDLED_MODEL_PATH.is_file() and BUNDLED_CONFIG_PATH.is_file():
            return BUNDLED_MODEL_PATH, BUNDLED_CONFIG_PATH

        return None, None

    def initialize(self) -> bool:
        """
        Initializes the Piper model once at startup.
        Validates both files exist, loads model, logs status.
        """
        model_p, config_p = self._resolve_paths()

        if not model_p or not config_p:
            self.init_error = (
                f"Validation failed: Piper voice files missing.\n"
                f"Checked primary: {PRIMARY_MODEL_PATH} ({PRIMARY_MODEL_PATH.exists()})\n"
                f"Checked config: {PRIMARY_CONFIG_PATH} ({PRIMARY_CONFIG_PATH.exists()})\n"
                f"Checked bundled: {BUNDLED_MODEL_PATH} ({BUNDLED_MODEL_PATH.exists()})"
            )
            logger.error(f"[PiperTTS] {self.init_error}")
            logger.warning("[PiperTTS] Piper voice will not be available. System will automatically use fallback TTS.")
            self.is_ready = False
            return False

        if not model_p.exists():
            self.init_error = f"ONNX model file does not exist: {model_p}"
            logger.error(f"[PiperTTS] {self.init_error}")
            self.is_ready = False
            return False

        if not config_p.exists():
            self.init_error = f"Voice configuration file does not exist: {config_p}"
            logger.error(f"[PiperTTS] {self.init_error}")
            self.is_ready = False
            return False

        try:
            from piper.voice import PiperVoice

            logger.info(f"[PiperTTS] Loading Piper Ryan High voice model from: {model_p}")
            self.voice = PiperVoice.load(str(model_p), config_path=str(config_p))
            self.active_model_path = model_p
            self.active_config_path = config_p
            self.is_ready = True
            self.init_error = None
            logger.info("[PiperTTS] Ryan High model loaded successfully! Piper TTS is ready as primary voice.")
            return True
        except Exception as e:
            self.init_error = str(e)
            self.is_ready = False
            self.voice = None
            logger.error(f"[PiperTTS] Error loading Ryan High voice model: {e}", exc_info=True)
            logger.warning("[PiperTTS] Automatically falling back to existing web speech synthesis.")
            return False

    def synthesize(self, text: str) -> Optional[bytes]:
        """
        Synthesizes text to WAV audio bytes using Ryan High Piper voice.
        Results are cached in memory for rapid playback.
        Returns None on failure without raising exceptions (allows graceful fallback).
        """
        if not self.is_ready or self.voice is None:
            logger.warning("[PiperTTS] synthesize called but Ryan High voice is not ready.")
            return None

        clean_text = (text or "").strip()
        if not clean_text:
            return None

        # Clean text of markdown asterisks and excess symbols for clean speech
        speech_text = clean_text.replace("**", "").replace("*", "").replace("#", "").strip()
        # Must contain at least one pronounceable word or digit
        if not speech_text or not any(c.isalnum() for c in speech_text):
            return None

        # In-memory cache lookup
        cache_key = hashlib.md5(speech_text.encode("utf-8")).hexdigest()
        if cache_key in self._cache:
            return self._cache[cache_key]

        try:
            buf = io.BytesIO()
            with wave.open(buf, "wb") as wav_file:
                # Pre-set default wave parameters so close() never raises '# channels not specified'
                wav_file.setnchannels(1)
                wav_file.setsampwidth(2)
                wav_file.setframerate(22050)
                self.voice.synthesize_wav(speech_text, wav_file)
            wav_bytes = buf.getvalue()

            if not wav_bytes or len(wav_bytes) < 44:
                logger.warning("[PiperTTS] Synthesized audio was empty.")
                return None

            # Cache maintenance
            if len(self._cache) >= self.max_cache_size:
                old_keys = list(self._cache.keys())[:100]
                for k in old_keys:
                    del self._cache[k]

            self._cache[cache_key] = wav_bytes
            return wav_bytes
        except Exception as e:
            logger.error(f"[PiperTTS] Synthesis failed for text '{speech_text[:40]}...': {e}", exc_info=True)
            return None


def get_piper_manager() -> PiperTTSManager:
    """Convenience getter for the Piper singleton."""
    return PiperTTSManager.get_instance()
