"""Frozen MobileNetV2 feature extractor (ImageNet weights, no training).

Smoke test (run this first, from the ml/ folder):
    python -m image.cnn_features ../data/xray/NORMAL
Expected output: a (5, 1280) feature matrix.
"""
import sys
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from torchvision.models import MobileNet_V2_Weights, mobilenet_v2

_weights = MobileNet_V2_Weights.IMAGENET1K_V1
_backbone = mobilenet_v2(weights=_weights).features.eval()
_pool = torch.nn.AdaptiveAvgPool2d(1)
_prep = _weights.transforms()  # resize 256 -> crop 224 -> ImageNet normalisation

IMG_EXT = {".jpg", ".jpeg", ".png"}


@torch.no_grad()
def extract_batch(paths, batch_size=32):
    """Return an (N, 1280) float32 array of CNN features for a list of image paths."""
    feats = []
    for i in range(0, len(paths), batch_size):
        imgs = [_prep(Image.open(p).convert("RGB")) for p in paths[i:i + batch_size]]
        out = _pool(_backbone(torch.stack(imgs))).flatten(1)
        feats.append(out.numpy())
    return np.vstack(feats)


def extract_one(pil_img):
    """Single PIL image -> (1280,) vector. Used later by the API endpoint."""
    x = _prep(pil_img.convert("RGB")).unsqueeze(0)
    with torch.no_grad():
        return _pool(_backbone(x)).flatten().numpy()


if __name__ == "__main__":
    folder = Path(sys.argv[1])
    files = sorted(p for p in folder.iterdir() if p.suffix.lower() in IMG_EXT)[:5]
    f = extract_batch(files)
    print("feature matrix:", f.shape)
