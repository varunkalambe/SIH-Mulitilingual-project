import sys
print("Python executable:", sys.executable)
print("Python version:", sys.version)

try:
    import vosk
    print("SUCCESS: Vosk is available")
    print("Vosk version:", getattr(vosk, '__version__', 'Unknown'))
except ImportError as e:
    print("ERROR: Vosk not found -", str(e))
