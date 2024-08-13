import sys
import json
import base64
from io import BytesIO
from deepface import DeepFace
from PIL import Image
import numpy as np

def analyze_mood(image_base64):
    try:
        image_data = base64.b64decode(image_base64.split(',')[1])
        image = Image.open(BytesIO(image_data))
        image = np.array(image)

        result = DeepFace.analyze(img_path=image, actions=['emotion'], enforce_detection=False)
        return result
    except Exception as e:
        print(f"Error during analysis: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    try:
        input_data = sys.stdin.read()
        image_base64 = json.loads(input_data)['image']
        analysis_result = analyze_mood(image_base64)
        print(json.dumps(analysis_result))
    except Exception as e:
        print(f"Error in main: {e}", file=sys.stderr)
        sys.exit(1)