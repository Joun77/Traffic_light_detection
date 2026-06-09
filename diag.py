import sys
print("Python:", sys.version)
try:
    import tensorflow as tf
    print("TF version:", tf.__version__)
    print("Has compat:", hasattr(tf, 'compat'))
    print("Has Graph:", hasattr(tf, 'Graph'))
except Exception as e:
    print("TF FAILED:", e)

try:
    import numpy as np
    print("NumPy:", np.__version__)
except Exception as e:
    print("NumPy FAILED:", e)

try:
    import protobuf
    print("protobuf ok")
except:
    import google.protobuf
    print("protobuf:", google.protobuf.__version__)
