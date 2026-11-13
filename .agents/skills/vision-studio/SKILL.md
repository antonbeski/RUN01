---
name: vision-studio
description: Authoritative guide for computer vision, YOLOv8 object detection, OpenCV/cv2 pipelines, and dynamic programmatic control of the RUN01 Vision Studio panel.
argument-hint: "[vision-task] [color-filter] [custom-model-instructions]"
metadata:
  author: run01
  version: "1.0.0"
---

# RUN01 Vision Studio & Computer Vision Engine Skill

This skill instructs the AI on generating high-performance computer vision code, configuring in-browser YOLOv8 tracking, custom OpenCV pipelines, and programmatically controlling the RUN01 Vision Studio.

---

## 1. Programmatic Control of Vision Studio (`vision_studio` module)

RUN01 provides a native Python module `vision_studio` pre-injected into Pyodide WASM. When the user asks you to modify Vision Studio, detect specific colors (e.g. yellow objects only), filter specific object classes, or build custom visual detectors, write Python code using `vision_studio`.

### Available Methods:

1. **`vision_studio.filter_color(color_name="yellow", hsv_lower=None, hsv_upper=None)`**:
   - Instructs Vision Studio to isolate and detect objects of a specific color in real-time.
   - Built-in color presets: `"yellow"`, `"red"`, `"green"`, `"blue"`, `"orange"`, `"purple"`, `"white"`, `"black"`.
   - Or supply custom HSV tuples: `hsv_lower=(20, 100, 100), hsv_upper=(35, 255, 255)` for precise yellow detection.
   - Automatically computes bounding boxes, contours, and center points for tracked colored objects.

2. **`vision_studio.filter_classes(class_list)`**:
   - Limits YOLOv8 detections exclusively to specified classes (e.g., `["person", "car"]` or `["cup", "bottle"]`).

3. **`vision_studio.open()` & `vision_studio.close()`**:
   - Programmatically reveals or hides the Vision Studio panel overlay.

4. **`vision_studio.start()` & `vision_studio.stop()`**:
   - Programmatically starts or pauses frame processing (camera or video stream).

5. **`vision_studio.use_camera()`**:
   - Activates live webcam streaming directly inside Vision Studio.

6. **`vision_studio.set_confidence(conf=0.25)`**:
   - Sets the detection confidence threshold (0.05 to 0.95).

7. **`vision_studio.reset()`**:
   - Restores default full-spectrum YOLOv8 detection.

---

## 2. Standard Pattern: "Detect Yellow Objects Only"

```python
import vision_studio

# Configure Vision Studio to detect yellow objects only via HSV color segmentation
vision_studio.filter_color("yellow")

# Open Vision Studio panel and begin live tracking automatically
vision_studio.open()
vision_studio.start()

print("[DONE] Vision Studio is now actively detecting YELLOW objects only!")
```

---

## 3. Custom OpenCV / In-Browser Image Processing

RUN01 also provides an in-browser `cv2` engine powered by NumPy and Pillow:
```python
import cv2
import numpy as np

# Create or load image
img = cv2.imread("sample")
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)

# Yellow color mask: Hue 20-35, Saturation 100-255, Value 100-255
lower_yellow = np.array([20, 100, 100], dtype=np.uint8)
upper_yellow = np.array([35, 255, 255], dtype=np.uint8)
mask = cv2.inRange(hsv, lower_yellow, upper_yellow)

# Show inline image
cv2.imshow("Yellow Detection Mask", mask)
```
