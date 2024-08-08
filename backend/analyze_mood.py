import sys
import json
import base64
from io import BytesIO
from deepface import DeepFace
from PIL import Image
import numpy as np

def analyze_mood(image_base64):
    image_data = base64.b64decode(image_base64)
    image = Image.open(BytesIO(image_data))
    image = np.array(image)

    result = DeepFace.analyze(img_path=image, actions=['emotion'])
    return result

if __name__ == "__main__":
    input_data = sys.stdin.read()
    image_base64 = json.loads(input_data)['image']
    analysis_result = analyze_mood(image_base64)
    print(json.dumps(analysis_result))
